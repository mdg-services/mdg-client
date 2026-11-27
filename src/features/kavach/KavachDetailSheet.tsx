import { FileText, RefreshCw, X } from 'lucide-react';
import * as React from 'react';

import { PhotoThumb } from '@/components/PhotoViewer';
import { Button, Spinner } from '@/components/ui';
import { useKavachCheck } from '@/hooks/api/useKavach';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import type { KavachDealerItem, KavachFile } from '@dk/shared/types';

import { clockWords, dayWords, howToOf, lineOf, titleOf, whoSendsLine, type KavachSections } from './kavachView';

const HISTORY_WORDS = new Set([
  'opened',
  'sent',
  'approved',
  'sent_back',
  'told_owner',
  'excused',
  'marked_done',
  'marked_not_done',
  'data',
  'missed',
]);

/**
 * What a row opens (ADR 0057 §5): what to do, the photo the dealer sent, the last photo MDG
 * accepted, and the short history. Nothing here asks for anything: the button is on the row.
 * The details are fetched when it opens (`GET …/checks/:id`); a point with no check yet (a
 * when-it-happens one) shows what to do and nothing more.
 */
export function KavachDetailSheet({
  item,
  section,
  onClose,
}: {
  item: KavachDealerItem;
  section: keyof KavachSections;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const panelRef = useDialog(onClose);
  const q = useKavachCheck(item.checkId);
  const title = titleOf(item, lang);
  const howTo = howToOf(item, lang).trim();
  const line = lineOf(item, section, lang);
  const who = whoSendsLine(item, lang);
  const data = q.data;
  const shownHistory = (data?.history ?? []).filter((h) => HISTORY_WORDS.has(h.what));

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="kavach-detail"
        className="safe-bottom relative mx-auto flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl bg-surface p-4 outline-none animate-in md:max-w-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="break-words text-heading text-text">{title}</h2>
            {line ? <p className="break-words text-body text-text-muted">{line}</p> : null}
            {who ? <p className="break-words text-body font-medium text-text">{who}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('kavach.detail.close')}
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-text active:bg-surface-2"
          >
            <X width={22} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {howTo ? (
          <section aria-labelledby="kavach-detail-what">
            <h3 id="kavach-detail-what" className="mb-1 text-subheading text-text">
              {t('kavach.detail.what')}
            </h3>
            <p className="whitespace-pre-line break-words text-body text-text">{howTo}</p>
          </section>
        ) : null}

        {item.checkId && q.isPending ? (
          <p role="status" aria-busy="true" className="flex items-center gap-2 text-body text-text-muted">
            <Spinner size={18} />
            {t('kavach.detail.loading')}
          </p>
        ) : null}

        {item.checkId && q.isError ? (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-body text-text-muted">
              {t('kavach.detail.failed')}
            </p>
            <Button
              size="lg"
              variant="secondary"
              leftIcon={<RefreshCw width={18} strokeWidth={1.75} />}
              onClick={() => void q.refetch()}
            >
              {t('kavach.photo.retry')}
            </Button>
          </div>
        ) : null}

        {data?.submission && data.submission.files.length > 0 ? (
          <section aria-labelledby="kavach-detail-sent">
            <h3 id="kavach-detail-sent" className="mb-2 text-subheading text-text">
              {t('kavach.detail.sent')}
            </h3>
            <Files files={data.submission.files} />
          </section>
        ) : null}

        {data?.lastApproved && data.lastApproved.files.length > 0 ? (
          <section aria-labelledby="kavach-detail-last">
            <h3 id="kavach-detail-last" className="mb-2 text-subheading text-text">
              {t('kavach.detail.last')}
              <span className="ml-2 text-meta font-normal text-text-muted">{dayWords(data.lastApproved.at, lang)}</span>
            </h3>
            <Files files={data.lastApproved.files} />
          </section>
        ) : null}

        {data ? (
          <section aria-labelledby="kavach-detail-history">
            <h3 id="kavach-detail-history" className="mb-1 text-subheading text-text">
              {t('kavach.detail.history')}
            </h3>
            {shownHistory.length === 0 ? (
              <p className="text-body text-text-muted">{t('kavach.detail.noHistory')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {shownHistory
                  .map((h, i) => (
                    <li key={`${h.at}-${i}`} className="flex flex-col py-2">
                      <span className="break-words text-body text-text">
                        {t(`kavach.hist.${h.what}` as MessageKey)}
                      </span>
                      <span className="text-meta text-text-muted">{`${dayWords(h.at, lang)}, ${clockWords(h.at)}`}</span>
                      {h.note ? <span className="break-words text-body text-text-muted">{h.note}</span> : null}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** The files of an upload: a photo is a thumbnail that opens large; a PDF is a named chip. */
function Files({ files }: { files: KavachFile[] }) {
  const t = useT();
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.storageKey}-${i}`}>
          {f.kind === 'image' ? (
            <PhotoThumb url={f.url} label={t('kavach.photoAlt')} />
          ) : (
            <span className="inline-flex min-h-12 items-center gap-2 rounded-md bg-surface-2 px-3 text-body text-text">
              <FileText className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="break-all">{f.filename}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
