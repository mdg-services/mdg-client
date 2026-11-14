import { Check } from 'lucide-react';
import * as React from 'react';

import { Alert, Block, CardBox, CardPending, LinkButton, Note, SaveButton } from '@/features/setup/CardParts';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type {
  OutletDetailValue,
  OutletDetailsQuestionView,
  OutletDetailsView,
} from '@dk/shared/types';

import {
  MAX_BUTTON_OPTIONS,
  answerText,
  changedAnswers,
  hasAnyAnswer,
  isDrawnKind,
  orderedOptions,
  pickWords,
  showsSuggestion,
  startingValue,
} from './outletDetailsView';
import { useOutletDetails, useSaveOutletDetails } from './useOutletDetails';

/** 16px text, so an iPhone does not zoom in on the box; 44px tall, so a thumb finds it. */
const FIELD_CLASS =
  'h-11 w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] text-wa-bubble-text placeholder:text-wa-meta focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60';

/**
 * The Pump details form inside an MDG message (`message.outletDetails`): the
 * questions MDG asks about the dealer's petrol pump (पंप की जानकारी).
 *
 * THE SERVER OWNS THE QUESTIONS. This card draws whatever it is sent, by each
 * question's `kind` (state, choice, text, number, yesno, date), with the server's
 * own words. It never counts the questions and never names one, so a question
 * added on the server shows here with no release of the app. A kind it does not
 * know is shown as the label and the saved value, and never breaks the card.
 *
 * THE CARD DRAWS THE ANSWERS NOW, never what was true when the message was
 * posted: it reads the live view (`useOutletDetails`), so an old message always
 * shows the current answers, and one owner's answer is every owner's.
 *
 * One Save for the whole form, which sends only what was changed. A manager reads
 * the answers and is told the owner fills them. An older server that has no such
 * route (404) leaves nothing drawn at all.
 */
export function OutletDetailsCard() {
  const q = useOutletDetails();
  const view = q.data;
  const { refetch } = q;
  const retry = React.useCallback(() => void refetch(), [refetch]);

  if (!view) {
    // An older server does not have the form: draw nothing rather than an error.
    if (q.error instanceof ApiError && q.error.status === 404) return null;
    return <CardPending failed={q.isError} onRetry={retry} />;
  }
  return <Form view={view} />;
}

/** The server's words for a refused save when it gave plain ones; ours otherwise. */
function saveErrorText(err: unknown, fallback: string): string {
  if (
    err instanceof ApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 401 &&
    err.status !== 403 &&
    err.message
  ) {
    return err.message;
  }
  return fallback;
}

function Form({ view }: { view: OutletDetailsView }) {
  const t = useT();
  const lang = useLang();
  const save = useSaveOutletDetails();
  const uid = React.useId();
  // What the owner has touched, by question id. Everything else is as the server has it,
  // so a refresh from the server never wipes a half-typed answer.
  const [edits, setEdits] = React.useState<Record<string, OutletDetailValue>>({});
  const [editing, setEditing] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  const title = pickWords(view.title, lang);
  const intro = pickWords(view.intro, lang);
  const words = { yes: t('outletDetails.yes'), no: t('outletDetails.no') };

  // The form is asked while there is something to ask: nothing answered yet, or a
  // required answer missing (a question added later brings the form back). Once it is
  // complete it is a plain summary with Change.
  const asking = view.canEdit && (editing || !view.complete || !hasAnyAnswer(view));

  if (!asking) {
    return (
      <CardBox kind="outlet-details">
        <Heading title={title} intro={intro} />
        <Block>
          <dl className="flex flex-col gap-1.5">
            {view.questions.map((question) => {
              const text = answerText(question, lang, words);
              return (
                <div key={question.id} data-question={question.id} className="min-w-0">
                  <dt className="break-words text-[12px] leading-tight text-wa-meta">
                    {pickWords(question.label, lang)}
                  </dt>
                  <dd
                    className={cn(
                      'flex items-center gap-1.5 break-words text-[14px] leading-snug',
                      text === null ? 'text-wa-meta' : 'font-medium',
                    )}
                  >
                    {text === null ? (
                      t('outletDetails.notAnswered')
                    ) : (
                      <>
                        <Check
                          width={14}
                          strokeWidth={2.5}
                          className="shrink-0 text-success"
                          aria-hidden
                        />
                        <span className="min-w-0 break-words">{text}</span>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Block>
        {view.canEdit ? (
          <div className="flex items-center justify-between gap-2">
            {justSaved ? <SavedLine /> : <span />}
            <LinkButton
              onClick={() => {
                save.reset();
                setJustSaved(false);
                setEdits({});
                setEditing(true);
              }}
            >
              {t('outletDetails.change')}
            </LinkButton>
          </div>
        ) : (
          <Note>{t('outletDetails.ownerFills')}</Note>
        )}
      </CardBox>
    );
  }

  const changes = changedAnswers(view, edits);
  const busy = save.isPending;

  const setValue = (question: OutletDetailsQuestionView, value: OutletDetailValue) => {
    save.reset();
    setJustSaved(false);
    setEdits((prev) => ({ ...prev, [question.id]: value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !changes) return;
    try {
      await save.mutateAsync({ answers: changes });
      setEdits({});
      setEditing(false);
      setJustSaved(true);
    } catch {
      // The alert below says so; what was typed stays for another try.
    }
  };

  return (
    <CardBox kind="outlet-details">
      <Heading title={title} intro={intro} />
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-2.5">
        {view.questions.map((question) => {
          const current = question.id in edits ? edits[question.id] : startingValue(question);
          return (
            <QuestionRow
              key={question.id}
              question={question}
              current={current}
              fieldId={`${uid}-${question.id}`}
              lang={lang}
              busy={busy}
              onChange={(value) => setValue(question, value)}
            />
          );
        })}

        {save.isError ? (
          <Alert>{saveErrorText(save.error, t('outletDetails.saveFailed'))}</Alert>
        ) : null}
        {justSaved && !save.isError ? <SavedLine /> : null}

        <SaveButton busy={busy} disabled={!changes}>
          {busy ? t('outletDetails.saving') : t('outletDetails.save')}
        </SaveButton>
        {editing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              save.reset();
              setEdits({});
              setEditing(false);
            }}
            className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10 disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
        ) : null}
      </form>
    </CardBox>
  );
}

function Heading({ title, intro }: { title: string; intro: string }) {
  return (
    <>
      {title ? <p className="break-words text-[14px] font-medium leading-snug">{title}</p> : null}
      {intro ? <Note className="break-words">{intro}</Note> : null}
    </>
  );
}

/** The calm line after a save. */
function SavedLine() {
  const t = useT();
  return (
    <p role="status" className="flex items-center gap-1.5 text-[13px] leading-snug text-wa-meta">
      <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
      {t('outletDetails.saved')}
    </p>
  );
}

/** One question: its label, its help line, the control for its kind, and the suggestion note. */
function QuestionRow({
  question,
  current,
  fieldId,
  lang,
  busy,
  onChange,
}: {
  question: OutletDetailsQuestionView;
  current: OutletDetailValue;
  fieldId: string;
  lang: Lang;
  busy: boolean;
  onChange: (value: OutletDetailValue) => void;
}) {
  const t = useT();
  const label = pickWords(question.label, lang);
  const help = pickWords(question.help, lang);
  const helpId = `${fieldId}-help`;
  const suggested = showsSuggestion(question, current);

  return (
    <div data-question={question.id} data-kind={question.kind} className="min-w-0">
      <p id={`${fieldId}-label`} className="mb-1 break-words text-[14px] font-medium leading-snug">
        {label}
        {question.required ? (
          <span className="ml-1.5 text-[12px] font-normal text-wa-meta">{t('common.required')}</span>
        ) : null}
      </p>
      {help ? (
        <p id={helpId} className="mb-1 break-words text-[13px] leading-snug text-wa-meta">
          {help}
        </p>
      ) : null}

      {isDrawnKind(question.kind) ? (
        <Control
          question={question}
          current={current}
          fieldId={fieldId}
          describedBy={help ? helpId : undefined}
          lang={lang}
          busy={busy}
          onChange={onChange}
        />
      ) : (
        // A kind this app does not know: the label (above) and what is saved, as words.
        <Block>
          <p className="break-words text-[14px] leading-snug">
            {answerText(question, lang, { yes: t('outletDetails.yes'), no: t('outletDetails.no') }) ??
              t('outletDetails.notAnswered')}
          </p>
        </Block>
      )}

      {suggested ? <Note className="mt-0.5">{t('outletDetails.suggested')}</Note> : null}
    </div>
  );
}

function BigButton({
  chosen,
  disabled,
  onClick,
  value,
  children,
}: {
  chosen: boolean;
  disabled: boolean;
  onClick: () => void;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-option={value}
      aria-pressed={chosen}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border-2 px-3 py-1.5 text-left text-[16px] font-medium leading-snug text-wa-bubble-text active:bg-black/10 disabled:opacity-60',
        chosen ? 'border-wa-accent bg-wa-row-active' : 'border-wa-divider bg-wa-in',
      )}
    >
      <span className="min-w-0 break-words">{children}</span>
      {chosen ? (
        <Check width={18} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
      ) : null}
    </button>
  );
}

/** The input for one question, chosen by its kind alone. */
function Control({
  question,
  current,
  fieldId,
  describedBy,
  lang,
  busy,
  onChange,
}: {
  question: OutletDetailsQuestionView;
  current: OutletDetailValue;
  fieldId: string;
  describedBy: string | undefined;
  lang: Lang;
  busy: boolean;
  onChange: (value: OutletDetailValue) => void;
}) {
  const t = useT();
  const { kind } = question;
  const labelledBy = `${fieldId}-label`;
  const placeholder = pickWords(question.placeholder, lang) || undefined;

  if (kind === 'state' || kind === 'choice') {
    const options = orderedOptions(question, lang);
    const value = typeof current === 'string' ? current : '';
    if (kind === 'choice' && options.length > 0 && options.length <= MAX_BUTTON_OPTIONS) {
      return (
        <div role="group" aria-labelledby={labelledBy} className="flex flex-col gap-1.5">
          {options.map((o) => {
            const chosen = o.value === value;
            return (
              <BigButton
                key={o.value}
                value={o.value}
                chosen={chosen}
                disabled={busy}
                // Tapping the chosen one again takes it back — but never for a required question.
                onClick={() => onChange(chosen && !question.required ? null : o.value)}
              >
                {o.label}
              </BigButton>
            );
          })}
        </div>
      );
    }
    return (
      <select
        id={fieldId}
        value={value}
        disabled={busy}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={question.required}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className={FIELD_CLASS}
      >
        <option value="">{t('outletDetails.pick')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (kind === 'yesno') {
    const value = typeof current === 'boolean' ? current : null;
    return (
      <div role="group" aria-labelledby={labelledBy} className="flex gap-1.5">
        {([true, false] as const).map((answer) => {
          const chosen = value === answer;
          return (
            <BigButton
              key={String(answer)}
              value={answer ? 'yes' : 'no'}
              chosen={chosen}
              disabled={busy}
              onClick={() => onChange(chosen && !question.required ? null : answer)}
            >
              {answer ? t('outletDetails.yes') : t('outletDetails.no')}
            </BigButton>
          );
        })}
      </div>
    );
  }

  // text, number and date are boxes. A number is held as the text typed, and turned
  // into a number only when it is sent.
  const text = current === null || current === undefined ? '' : String(current);
  const common = {
    id: fieldId,
    value: text,
    disabled: busy,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-required': question.required,
    className: FIELD_CLASS,
  } as const;

  if (kind === 'number') {
    return (
      <input
        {...common}
        type="number"
        inputMode="numeric"
        min={question.min}
        max={question.max}
        placeholder={placeholder}
        autoComplete="off"
        // Kept as typed; `canonical` reads it as a number when it is compared and sent.
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (kind === 'date') {
    return <input {...common} type="date" onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      {...common}
      type="text"
      maxLength={question.maxLength}
      placeholder={placeholder}
      autoComplete="off"
      enterKeyHint="done"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
