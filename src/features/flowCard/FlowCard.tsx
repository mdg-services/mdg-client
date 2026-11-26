import * as React from 'react';
import { createPortal } from 'react-dom';

import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { useLang, useT } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { sayIn, type FlowCardAction, type FlowCardView, type FlowRow, type Message } from '@dk/shared/types';

import {
  CardFrame,
  FootButton,
  FootButtons,
  Pill,
  ProblemRow,
  RowShell,
  VideoRow,
  WarningLine,
  type MarkKind,
} from './CardParts';
import { OwnWords } from './OwnWords';
import { refusalWords, useActOnFlowCard, useAnswerFlowCard, useFlowCard } from './useFlowCard';

/**
 * A LIVING CARD in the chat (ADR 0059): the card the server draws for a flow, painted
 * on the one message it names live. An older message that carries the same card paints
 * nothing at all, so the chat never shows two copies of one order.
 *
 * Every row is a question. A `done` row is a green tick and the answer; an `open` row
 * shows its pills (picked = filled black); a fuel's KL row sits under "Kitna load?"
 * with the fuel's name at its left. A tap goes to the server, which checks it like any
 * typed answer and sends back the card as it is after it.
 */
export function FlowCardMessage({
  message,
  onSay,
}: {
  message: Message;
  /**
   * Send words as the dealer's own message, quoting the card: the "MDG se baat" button,
   * and an answer in the dealer's own words.
   */
  onSay?: (text: string, replyToMessageId?: string) => void;
}) {
  const marker = message.flowCard!;
  const q = useFlowCard(marker.flow, marker.ref);
  const card = q.data;
  if (!card) {
    // Not loaded yet: a quiet placeholder the size of a short card, never a spinner in the chat.
    return q.isError ? null : <div aria-hidden className="h-28 w-[92%] max-w-[22.5rem] animate-pulse rounded-lg bg-wa-in/70 motion-reduce:animate-none" />;
  }
  // Painted only on the message the card names live (and on the only one, before any is named).
  if (card.liveMessageId && card.liveMessageId !== message.id) return null;
  return (
    <div className="w-[92%] max-w-[22.5rem]">
      <FlowCardBody card={card} onSay={onSay ? (text) => onSay(text, message.id) : undefined} />
    </div>
  );
}

function rowMark(row: FlowRow): MarkKind {
  return row.state === 'done' ? 'done' : row.state === 'problem' ? 'problem' : row.state === 'working' ? 'working' : row.state === 'later' ? 'later' : 'open';
}

export function FlowCardBody({ card, onSay }: { card: FlowCardView; onSay?: (text: string) => void }) {
  const t = useT();
  const lang = useLang();
  const titleId = React.useId();
  const answer = useAnswerFlowCard(card.flow, card.ref);
  const act = useActOnFlowCard(card.flow, card.ref);
  const [tapped, setTapped] = React.useState<{ row: string; value: string } | null>(null);
  const [error, setError] = React.useState<{ row: string | null; text: string } | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const busy = answer.isPending || act.isPending;

  const failText = (err: unknown) => {
    const w = refusalWords(err);
    return w ? sayIn(w, lang) : t('flow.saveFailed');
  };
  const send = (row: string, value: string) => {
    if (!card.canAnswer || busy) return;
    setTapped({ row, value });
    setError(null);
    answer.mutate(
      { row, value },
      {
        onError: (err) => setError({ row, text: failText(err) }),
        onSettled: () => setTapped(null),
      },
    );
  };
  const press = (a: FlowCardAction) => {
    if (busy) return;
    if (a.say) {
      onSay?.(sayIn(a.say, lang));
      return;
    }
    setError(null);
    act.mutate({ action: a.id, stamp: card.stamp }, { onError: (err) => setError({ row: null, text: failText(err) }) });
  };

  // Rows are numbered as questions; a fuel's KL part shares its heading's number.
  let n = 0;
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < card.rows.length; i++) {
    const row = card.rows[i]!;
    if (row.part) continue;
    n += 1;
    const parts: FlowRow[] = [];
    for (let j = i + 1; j < card.rows.length && card.rows[j]!.part; j++) parts.push(card.rows[j]!);
    rows.push(
      <QuestionRow
        key={row.key}
        row={row}
        parts={parts}
        n={n}
        lang={lang}
        canAnswer={card.canAnswer && card.status !== 'working' && card.status !== 'done'}
        // Once every question is answered, a row with parts (the fuels) folds to its answer too.
        foldParts={card.status !== 'asking'}
        busy={busy}
        tapped={tapped}
        error={error && error.row !== null && (error.row === row.key || parts.some((p) => p.key === error.row)) ? error.text : null}
        onPick={send}
        onWords={onSay}
      />,
    );
  }

  const primary = card.actions.filter((a) => a.tone === 'primary');
  const secondary = card.actions.filter((a) => a.tone !== 'primary');
  const pressing = act.isPending ? act.variables?.action : null;

  return (
    <CardFrame titleId={titleId} title={sayIn(card.title, lang)} meta={card.meta} progress={card.progress ? { ...card.progress, label: t('flow.progress', card.progress) } : null} testId="flow-card">
      <ol aria-label={sayIn(card.title, lang)}>{rows}</ol>

      {card.problem ? <ProblemRow text={sayIn(card.problem.text, lang)} detail={card.problem.detail.map((d) => sayIn(d, lang))} /> : null}

      {card.summary.length > 0 || card.warnings.length > 0 ? (
        <div className="border-t border-wa-divider px-4 py-3" aria-live="polite" data-testid="flow-summary">
          {card.summary.map((s, i) => (
            <p key={i} className={i === 0 ? 'break-words text-body font-semibold' : 'break-words text-meta text-wa-meta'}>
              {sayIn(s, lang)}
            </p>
          ))}
          {card.warnings.map((w, i) => (
            <WarningLine key={i}>{sayIn(w, lang)}</WarningLine>
          ))}
        </div>
      ) : null}

      {error && error.row === null ? (
        <p role="alert" className="border-t border-wa-divider px-4 py-2 text-meta text-status-problem-ink">
          {error.text}
        </p>
      ) : null}

      {card.actions.length === 1 && card.actions[0]!.tone === 'secondary' && !card.actions[0]!.say ? (
        // One quiet way out ("Rehne dijiye") while the owner is still choosing: a text
        // button at the foot, not a full-width box competing with the pills.
        <div className="flex justify-end border-t border-wa-divider px-2 py-1">
          <button
            type="button"
            data-testid={`flow-action-${card.actions[0]!.id}`}
            disabled={busy}
            onClick={() => press(card.actions[0]!)}
            className="min-h-11 rounded-md px-3 text-cta text-wa-meta active:bg-wa-row-active disabled:opacity-50"
          >
            {sayIn(card.actions[0]!.label, lang)}
          </button>
        </div>
      ) : card.actions.length > 0 ? (
        <FootButtons>
          {[...primary, ...secondary].map((a) => (
            <FootButton
              key={a.id}
              tone={a.tone}
              testId={`flow-action-${a.id}`}
              disabled={busy}
              busy={pressing === a.id}
              onClick={() => press(a)}
            >
              {sayIn(a.label, lang)}
            </FootButton>
          ))}
        </FootButtons>
      ) : !card.canAnswer && (card.status === 'asking' || card.status === 'ready') ? (
        <p className="border-t border-wa-divider px-4 py-2.5 text-meta text-wa-meta">{t('flow.readOnly')}</p>
      ) : null}

      {card.video && card.status !== 'closed' ? <VideoRow title={sayIn(card.video.title, lang)} seconds={card.video.seconds} onPlay={() => setPlaying(true)} /> : null}
      {playing && card.video
        ? createPortal(<GuideVideoSheet id={card.video.id} title={sayIn(card.video.title, lang)} onClose={() => setPlaying(false)} />, document.body)
        : null}
    </CardFrame>
  );
}

const STATE_KEY = {
  done: 'setup.stateDone',
  open: 'setup.stateCurrent',
  later: 'setup.stateTodo',
  problem: 'flow.stateProblem',
  working: 'flow.stateWorking',
} as const;

function QuestionRow({
  row,
  parts,
  n,
  lang,
  canAnswer,
  busy,
  tapped,
  error,
  onPick,
  foldParts,
  onWords,
}: {
  row: FlowRow;
  parts: FlowRow[];
  n: number;
  lang: Lang;
  canAnswer: boolean;
  busy: boolean;
  tapped: { row: string; value: string } | null;
  error: string | null;
  onPick: (row: string, value: string) => void;
  foldParts: boolean;
  /** The dealer's own words, when no choice fits: sent to the chat, quoting the card. */
  onWords?: (text: string) => void;
}) {
  const t = useT();
  const [changing, setChanging] = React.useState(false);
  const kind = rowMark(row);
  // A done row folds to its answer unless the owner tapped "Change". A row with parts (the
  // fuels) stays open while the card is still asking: the owner may add a second fuel.
  const folded = row.state === 'done' && !changing && (parts.length === 0 || foldParts);
  const answerKey = row.answer ? JSON.stringify(row.answer) : '';
  React.useEffect(() => {
    // The new answer came back: fold again (a row of fuels stays open to add another).
    if (row.state === 'done' && parts.length === 0) setChanging(false);
  }, [row.state, answerKey, parts.length]);

  return (
    <RowShell kind={kind} n={n} stateWord={t(STATE_KEY[row.state])} rowKey={row.key} muted={row.state === 'later'} testId={`flow-row-${row.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        {/* A basis wider than the button: at large text the button drops under the answer
            instead of squeezing it into a column that splits words. */}
        <div className="min-w-0 flex-1 basis-[11rem]">
          {row.state === 'done' && row.answer ? (
            <>
              <p className="text-meta text-wa-meta">{sayIn(row.label, lang)}</p>
              <p className="break-words text-body font-semibold">{sayIn(row.answer, lang)}</p>
            </>
          ) : (
            <p className={row.state === 'later' ? 'text-body text-wa-meta' : 'break-words text-subheading'}>{sayIn(row.label, lang)}</p>
          )}
          {row.note ? <p className="mt-0.5 break-words text-meta text-wa-meta">{sayIn(row.note, lang)}</p> : null}
        </div>
        {folded && row.canChange && canAnswer ? (
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="-my-1 min-h-11 shrink-0 rounded-md px-2 text-meta font-semibold text-wa-accent-strong underline underline-offset-4 active:bg-wa-row-active"
          >
            {t('flow.change')}
          </button>
        ) : null}
      </div>

      {!folded && row.choices && row.choices.length > 0 && row.state !== 'later' ? (
        <Choices row={row} lang={lang} canAnswer={canAnswer} busy={busy} tapped={tapped} onPick={onPick} onWords={onWords} />
      ) : null}

      {parts.length > 0 && !folded ? (
        <div className="mt-2 space-y-2.5">
          {parts.map((p) => (
            <PartRow key={p.key} row={p} lang={lang} canAnswer={canAnswer} busy={busy} tapped={tapped} onPick={onPick} onWords={onWords} />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-meta text-status-problem-ink">
          {error}
        </p>
      ) : null}
    </RowShell>
  );
}

function Choices({
  row,
  lang,
  canAnswer,
  busy,
  tapped,
  onPick,
  onWords,
}: {
  row: FlowRow;
  lang: Lang;
  canAnswer: boolean;
  busy: boolean;
  tapped: { row: string; value: string } | null;
  onPick: (row: string, value: string) => void;
  onWords?: (text: string) => void;
}) {
  return (
    <div role="group" aria-label={sayIn(row.label, lang)} className="mt-2 flex flex-wrap gap-2">
      {row.choices!.map((c) => (
        <Pill
          key={c.value}
          value={c.value}
          selected={c.selected}
          busy={tapped?.row === row.key && tapped.value === c.value}
          disabled={!canAnswer || busy || c.disabled}
          hint={c.hint ? sayIn(c.hint, lang) : undefined}
          onClick={() => onPick(row.key, c.value)}
        >
          {sayIn(c.label, lang)}
        </Pill>
      ))}
      {canAnswer && onWords ? <OwnWords label={sayIn(row.label, lang)} disabled={busy} onWords={onWords} /> : null}
    </div>
  );
}

/**
 * One fuel under "Kitna load?": its name, its KL pills, and "✎" for any other figure — a
 * number goes to the row like a tap; words ("jitna tank mein aaye") go to the chat.
 */
function PartRow({
  row,
  lang,
  canAnswer,
  busy,
  tapped,
  onPick,
  onWords,
}: {
  row: FlowRow;
  lang: Lang;
  canAnswer: boolean;
  busy: boolean;
  tapped: { row: string; value: string } | null;
  onPick: (row: string, value: string) => void;
  onWords?: (text: string) => void;
}) {
  const name = sayIn(row.label, lang);
  const typed = row.typed;
  return (
    <div data-testid={`flow-part-${row.key}`} className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-body font-semibold">
        <FuelSwatch fuelKey={row.key} />
        {name}
      </p>
      <div role="group" aria-label={name} className="flex flex-wrap gap-1.5">
        {(row.choices ?? []).map((c) => (
          <Pill
            key={c.value}
            value={c.value}
            selected={c.selected}
            busy={tapped?.row === row.key && tapped.value === c.value}
            disabled={!canAnswer || busy}
            tight
            // A second tap on the picked amount takes the fuel off the order.
            onClick={() => onPick(row.key, c.selected ? '0' : c.value)}
          >
            {sayIn(c.label, lang)}
          </Pill>
        ))}
        {canAnswer && (typed || onWords) ? (
          <OwnWords
            compact
            label={name}
            disabled={busy}
            onWords={(text) => onWords?.(`${name}: ${text}`)}
            onNumber={(v) => {
              const n = Number(v);
              if (!typed || !Number.isFinite(n) || n < typed.min || n > typed.max) return false;
              onPick(row.key, v);
              return true;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A small swatch beside a fuel's name, never the only cue (the name is always there). */
function FuelSwatch({ fuelKey }: { fuelKey: string }) {
  const product = fuelKey.replace(/^kl:/, '');
  const cls = product === 'HSD' ? 'bg-fuel-diesel' : product === 'MS' ? 'bg-fuel-petrol' : 'bg-fuel-other';
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${cls}`} />;
}
