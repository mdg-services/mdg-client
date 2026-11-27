import { Camera, FileText, RotateCw, User } from 'lucide-react';

import { StatusPill } from '@/components/kit';
import { Button, Spinner } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import type { KavachDealerItem } from '@dk/shared/types';

import { KavachThumb } from './KavachThumb';
import {
  actionOf,
  actionWord,
  isLoud,
  lineOf,
  sheetOf,
  tagOf,
  titleOf,
  whoSendsLine,
  type KavachRole,
  type RowSection,
} from './kavachView';
import type { SendState } from './useKavachActions';

export interface KavachActionHandlers {
  /** Take a photo for this row (camera). */
  onCamera: (item: KavachDealerItem) => void;
  /** Choose a photo or a PDF for this row (picker). */
  onChoose: (item: KavachDealerItem) => void;
  onSheet: (item: KavachDealerItem) => void;
  onRetry: (item: KavachDealerItem) => void;
}

/**
 * What a row (or its details sheet) lets the dealer do. On a ROW there is ONE button, calm (a quiet outline)
 * for most rows and loud (the near-black one) only for a late or sent-back row, so the one that costs marks
 * is the one that stands out; the other ways in (the sheet MDG made, "Choose photo or file") are in the
 * details sheet a tap on the row's words opens (`mode="sheet"`), where there is room for them. A photo already
 * With MDG offers a different one, to the person whose job it is. While a send runs, or after it failed,
 * the words of that take the button's place.
 */
export function KavachActions({
  item,
  section,
  role,
  mode = 'row',
  send,
  onCamera,
  onChoose,
  onSheet,
  onRetry,
}: {
  item: KavachDealerItem;
  section: RowSection;
  role?: KavachRole;
  /** `row`: the one main button. `sheet`: the main button and the other ways to send. */
  mode?: 'row' | 'sheet';
  send?: SendState | undefined;
} & KavachActionHandlers) {
  const t = useT();
  const lang = useLang();
  const title = titleOf(item, lang);
  const label = (word: string) => t('kv.act.labelled', { action: word, title });
  const action = actionOf(item, section, role);

  if (send === 'sending') {
    return (
      <p role="status" aria-busy="true" className="flex min-h-11 items-center gap-2 text-body text-text-muted">
        <Spinner size={18} />
        {t('kv.photo.sending')}
      </p>
    );
  }
  if (send === 'sent') {
    return (
      <p role="status" className="min-h-11 py-2 text-body font-medium text-status-ok-ink">
        {t('kv.photo.sent')}
      </p>
    );
  }
  if (send === 'wrongType') {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-body font-medium text-status-problem-ink">
          {t('kv.photo.wrongType')}
        </p>
        <Button size="md" fullWidth leftIcon={<Camera width={18} strokeWidth={1.75} />} onClick={() => onCamera(item)}>
          {t('kv.act.sendPhoto')}
        </Button>
      </div>
    );
  }
  if (send === 'failed') {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-body font-medium text-status-problem-ink">
          {t('kv.photo.failed')}
        </p>
        <Button size="md" fullWidth leftIcon={<RotateCw width={18} strokeWidth={1.75} />} onClick={() => onRetry(item)}>
          {t('kv.photo.retry')}
        </Button>
      </div>
    );
  }
  if (!action) return null;

  const word = actionWord(item, action, lang);
  const loud = isLoud(item);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="md"
        fullWidth
        variant={loud ? 'primary' : 'secondary'}
        aria-label={label(word)}
        leftIcon={<Camera width={18} strokeWidth={1.75} />}
        onClick={() => onCamera(item)}
        data-testid={action === 'replace' ? `kavach-replace-${item.code}` : `kavach-act-${item.code}`}
      >
        {word}
      </Button>
      {mode === 'sheet' && sheetOf(item, section, role) ? (
        <Button
          size="md"
          fullWidth
          variant="secondary"
          aria-label={label(t('kv.act.sheet'))}
          leftIcon={<FileText width={18} strokeWidth={1.75} />}
          onClick={() => onSheet(item)}
          data-testid={`kavach-sheet-${item.code}`}
        >
          {t('kv.act.sheet')}
        </Button>
      ) : null}
      {mode === 'sheet' && item.acceptsFile ? (
        <Button
          size="md"
          fullWidth
          variant="secondary"
          aria-label={label(t('kv.act.choose'))}
          leftIcon={<FileText width={18} strokeWidth={1.75} />}
          onClick={() => onChoose(item)}
          data-testid={`kavach-choose-${item.code}`}
        >
          {t('kv.act.choose')}
        </Button>
      ) : null}
    </div>
  );
}

export interface KavachRowProps extends KavachActionHandlers {
  item: KavachDealerItem;
  section: RowSection;
  /** Who is reading: a row that is the other member's says whose it is. */
  role?: KavachRole;
  /** "Worth N% of your score", only when the server says the point counts now. */
  worth?: number | null;
  send?: SendState | undefined;
  onOpen: (item: KavachDealerItem) => void;
}

/**
 * One point of the checklist: the title, ONE plain line (why, when, how long is left), a tag (shape and
 * word), and the one button that does it. Tapping the words opens the details. The row never marks
 * anything done: only MDG does that.
 */
export function KavachRow({ item, section, role, worth, send, onOpen, ...handlers }: KavachRowProps) {
  const t = useT();
  const lang = useLang();
  const title = titleOf(item, lang);
  const line = lineOf(item, section, lang);
  const tag = tagOf(item, section, lang);
  const who = whoSendsLine(item, lang, role);

  return (
    <li data-kavach-code={item.code} data-state={item.state} className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-1 text-left"
        >
          <span className="break-words text-subheading text-text">{title}</span>
          {line ? <span className="break-words text-body text-text-muted">{line}</span> : null}
          {who ? (
            <span className="flex items-center gap-1.5 break-words text-meta text-text-muted">
              <User className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {who}
            </span>
          ) : null}
          {worth ? <span className="break-words text-meta text-text-muted">{t('kv.worth', { pct: worth })}</span> : null}
          {tag ? <StatusPill status={tag.status} word={tag.word} className="mt-0.5" /> : null}
        </button>
        {section === 'waiting' ? <KavachThumb url={item.thumbUrl} label={t('kv.photoAlt')} /> : null}
      </div>
      <KavachActions item={item} section={section} role={role} send={send} {...handlers} />
    </li>
  );
}
