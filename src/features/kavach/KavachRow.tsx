import { Camera, FileText, RotateCw } from 'lucide-react';
import * as React from 'react';

import { PhotoThumb } from '@/components/PhotoViewer';
import { Button, Spinner } from '@/components/ui';
import { StatusBadge } from '@/features/reports/StatusBadge';
import { useLang, useT } from '@/lib/i18n';
import type { KavachDealerItem } from '@dk/shared/types';

import {
  actionOf,
  actionWord,
  lineOf,
  tagOf,
  titleOf,
  whoSendsLine,
  type KavachSections,
} from './kavachView';
import type { SendState } from './useKavachActions';

export interface KavachRowProps {
  item: KavachDealerItem;
  section: keyof KavachSections;
  send?: SendState;
  /** Take a photo for this row (camera). */
  onCamera: (item: KavachDealerItem) => void;
  /** Choose a photo or a PDF for this row (picker). */
  onChoose: (item: KavachDealerItem) => void;
  onSheet: (item: KavachDealerItem) => void;
  onRetry: (item: KavachDealerItem) => void;
  onOpen: (item: KavachDealerItem) => void;
}

/**
 * One point of the checklist, as one row of a ruled white sheet: the title, ONE plain line, a
 * quiet tag (shape and word), and the one button that does it. Tapping the words opens the details.
 * The row never marks anything done: only MDG does that.
 */
export function KavachRow({ item, section, send, onCamera, onChoose, onSheet, onRetry, onOpen }: KavachRowProps) {
  const t = useT();
  const lang = useLang();
  const title = titleOf(item, lang);
  const line = lineOf(item, section, lang);
  const tag = tagOf(item, section, lang);
  const who = whoSendsLine(item, lang);
  const action = actionOf(item, section);
  const label = (word: string) => t('kavach.act.labelled', { action: word, title });

  let controls: React.ReactNode = null;
  if (send === 'sending') {
    controls = (
      <p role="status" aria-busy="true" className="flex min-h-12 items-center gap-2 text-body text-text-muted">
        <Spinner size={18} />
        {t('kavach.photo.sending')}
      </p>
    );
  } else if (send === 'sent') {
    controls = (
      <p role="status" className="min-h-12 py-3 text-body font-medium text-status-ok-ink">
        {t('kavach.photo.sent')}
      </p>
    );
  } else if (send === 'wrongType') {
    controls = (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-body font-medium text-status-problem-ink">
          {t('kavach.photo.wrongType')}
        </p>
        <Button size="lg" fullWidth leftIcon={<Camera width={18} strokeWidth={1.75} />} onClick={() => onCamera(item)}>
          {t('kavach.act.sendPhoto')}
        </Button>
      </div>
    );
  } else if (send === 'failed') {
    controls = (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-body font-medium text-status-problem-ink">
          {t('kavach.photo.failed')}
        </p>
        <Button size="lg" fullWidth leftIcon={<RotateCw width={18} strokeWidth={1.75} />} onClick={() => onRetry(item)}>
          {t('kavach.photo.retry')}
        </Button>
      </div>
    );
  } else if (action === 'photo' || action === 'event') {
    const word = actionWord(item, action, lang);
    controls = (
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          fullWidth
          aria-label={label(word)}
          leftIcon={<Camera width={18} strokeWidth={1.75} />}
          onClick={() => onCamera(item)}
          data-testid={`kavach-act-${item.code}`}
        >
          {word}
        </Button>
        {item.acceptsFile ? (
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            aria-label={label(t('kavach.act.choose'))}
            leftIcon={<FileText width={18} strokeWidth={1.75} />}
            onClick={() => onChoose(item)}
            data-testid={`kavach-choose-${item.code}`}
          >
            {t('kavach.act.choose')}
          </Button>
        ) : null}
      </div>
    );
  } else if (action === 'sheet') {
    const open = actionWord(item, 'sheet', lang);
    controls = (
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          fullWidth
          aria-label={label(open)}
          leftIcon={<FileText width={18} strokeWidth={1.75} />}
          onClick={() => onSheet(item)}
          data-testid={`kavach-act-${item.code}`}
        >
          {open}
        </Button>
        <Button
          size="lg"
          fullWidth
          variant="secondary"
          aria-label={label(t('kavach.act.sendPhoto'))}
          leftIcon={<Camera width={18} strokeWidth={1.75} />}
          onClick={() => onCamera(item)}
          data-testid={`kavach-send-${item.code}`}
        >
          {t('kavach.act.sendPhoto')}
        </Button>
      </div>
    );
  }

  return (
    <li data-kavach-code={item.code} data-state={item.state} className="flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="flex min-h-12 min-w-0 flex-1 flex-col items-start gap-1 text-left"
        >
          <span className="break-words text-subheading text-text">{title}</span>
          {line ? <span className="break-words text-body text-text-muted">{line}</span> : null}
          {who ? <span className="break-words text-body font-medium text-text">{who}</span> : null}
          {tag ? <StatusBadge status={tag.status} lang={lang} word={tag.word} className="mt-0.5 w-fit" /> : null}
        </button>
        {section === 'waiting' && item.thumbUrl ? <PhotoThumb url={item.thumbUrl} label={t('kavach.photoAlt')} /> : null}
      </div>
      {controls}
    </li>
  );
}
