import { FileText, ImageOff, RefreshCw, ZoomIn } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { MediaViewer, type MediaViewerItem } from '@/features/chat/MediaViewer';
import { useAttachmentDownload, type AttachmentSource } from '@/lib/downloadAttachment';
import { useT } from '@/lib/i18n';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import type { Attachment } from '@dk/shared/types';

/**
 * The picture an OLD report message carries (ADR 0056 §1): a message sent before reports had
 * a snapshot has nothing to draw, only the card picture MDG posted. It opens here, inline in the
 * overlay, with the same behaviour the chat's picture viewer has:
 *
 *  - the link re-signs itself when it has gone stale (`useFreshImageSrc`),
 *  - a picture that will not load says so in words and has a button to try again,
 *  - a tap opens the full-screen viewer, where the dealer can pinch and drag to read a small
 *    figure (`MediaViewer`; it owns its own history entry, so Back closes it first).
 *
 * A file that is not a picture (a PDF card) is a button that opens it the way the chat does.
 */

interface PictureTileProps {
  attachment: Attachment;
  source: AttachmentSource;
  onOpen: () => void;
}

function PictureTile({ attachment, source, onOpen }: PictureTileProps) {
  const t = useT();
  const { src, refreshing, failed, onError, retry } = useFreshImageSrc(attachment, source);
  // A picture that arrived with no link at all has nothing to fail to load; ask for one.
  const hasLink = !!attachment.url;
  React.useEffect(() => {
    if (!hasLink) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per picture
  }, [hasLink, attachment.storageKey]);
  const [loadedSrc, setLoadedSrc] = React.useState<string | undefined>();
  const loaded = loadedSrc !== undefined && loadedSrc === src;

  if (failed) {
    return (
      <div
        role="alert"
        data-testid="picture-failed"
        className="flex flex-col items-center gap-3 rounded-2xl border border-wa-divider bg-wa-in px-4 py-8 text-center"
      >
        <ImageOff width={32} strokeWidth={1.75} className="text-wa-meta" aria-hidden />
        <p className="text-body font-medium text-wa-bubble-text">{t('report.picture.failed')}</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-wa-divider bg-wa-chip px-4 text-cta text-wa-bubble-text active:bg-wa-row-active"
        >
          <RefreshCw width={18} strokeWidth={2} aria-hidden />
          {t('report.picture.retry')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('report.picture.zoom')}
      data-testid="picture-tile"
      className="relative block w-full overflow-hidden rounded-2xl border border-wa-divider bg-white text-left active:opacity-90"
    >
      {src ? (
        <img
          src={src}
          alt={attachment.filename}
          onError={onError}
          onLoad={() => setLoadedSrc(src)}
          className="block h-auto w-full"
          draggable={false}
        />
      ) : null}
      {!loaded || refreshing ? (
        <span className="flex min-h-48 items-center justify-center">
          <Spinner size={24} />
        </span>
      ) : null}
      {loaded ? (
        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-body font-medium text-white">
          <ZoomIn width={16} strokeWidth={2} aria-hidden />
          {t('report.picture.zoomHint')}
        </span>
      ) : null}
    </button>
  );
}

export interface PictureFallbackProps {
  /** The signed attachments the report route sent (or the chat message's own). */
  attachments: readonly Attachment[];
  conversationId: string;
  messageId: string;
  /** The message's words, in the reader's language. */
  headline?: string;
  /** ISO time the message was sent (for the viewer's caption line). */
  sentAt: string;
  /** What the viewer calls the sender. */
  senderLabel: string;
}

export function PictureFallback({
  attachments,
  conversationId,
  messageId,
  headline,
  sentAt,
  senderLabel,
}: PictureFallbackProps) {
  const t = useT();
  const download = useAttachmentDownload();
  const source = React.useMemo<AttachmentSource>(() => ({ conversationId, messageId }), [conversationId, messageId]);
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image' && a.kind !== 'audio');
  const [viewing, setViewing] = React.useState<string | null>(null);

  const items = React.useMemo<MediaViewerItem[]>(
    () =>
      images.map((attachment) => ({
        key: `${messageId}:${attachment.storageKey}`,
        attachment,
        source,
        senderLabel,
        createdAt: sentAt,
        ...(headline ? { caption: headline } : {}),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `images` is derived from `attachments`
    [attachments, messageId, source, senderLabel, sentAt, headline],
  );
  const closeViewer = React.useCallback(() => setViewing(null), []);

  return (
    <div data-testid="picture-fallback" className="flex flex-col gap-3">
      <p className="text-body leading-relaxed text-wa-bubble-text">{t('report.picture.note')}</p>
      {headline ? <p className="text-body font-medium leading-relaxed text-wa-bubble-text">{headline}</p> : null}
      {images.map((a) => (
        <PictureTile
          key={a.storageKey}
          attachment={a}
          source={source}
          onOpen={() => setViewing(`${messageId}:${a.storageKey}`)}
        />
      ))}
      {files.map((a) => (
        <button
          key={a.storageKey}
          type="button"
          onClick={() => void download(a, source)}
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-wa-divider bg-wa-in px-4 text-left text-cta text-wa-bubble-text active:bg-wa-row-active"
        >
          <FileText width={24} strokeWidth={1.75} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{t('report.picture.openFile')}</span>
        </button>
      ))}
      {viewing && items.length > 0 ? (
        <MediaViewer
          items={items}
          initialKey={viewing}
          onClose={closeViewer}
          onDownload={(attachment, src) => void download(attachment, src)}
        />
      ) : null}
    </div>
  );
}
