import { Plus, SendHorizonal, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useBackToClose } from '@/lib/useBackToClose';

import type { StagedFile } from './AttachmentPreview';

export interface MediaSendPreviewProps {
  /** The pictures about to go, in the order they will arrive. */
  items: StagedFile[];
  /** What was already typed in the message box — it becomes the caption. */
  initialCaption?: string;
  sending?: boolean;
  /** Back or ✕ on the bar: forget the lot. */
  onClose: () => void;
  /** Take one picture out of the batch. */
  onRemove: (id: string) => void;
  /** Open the gallery again to put more in. */
  onAddMore: () => void;
  /** One message: every picture, one caption. */
  onSend: (caption: string) => void;
}

/**
 * The screen a photo passes through on its way into the chat: the picture large
 * on black, a caption line, and the green send button — WhatsApp's, because
 * "look at it before it goes" is what the dealer expects of a photo and the old
 * 40-pixel chip above the keyboard did not give them.
 *
 * Several pictures travel as ONE message with ONE caption (the server allows ten
 * attachments to a message), and the strip under the big one is how they are
 * reviewed: tap to switch, ✕ on the current one to drop it, + to fetch more.
 * Dropping the last one is the same as backing out.
 *
 * Back and ✕ throw everything away. Nothing here is kept: the pictures are only
 * handed on by `onSend`.
 */
export function MediaSendPreview({
  items,
  initialCaption = '',
  sending,
  onClose,
  onRemove,
  onAddMore,
  onSend,
}: MediaSendPreviewProps) {
  const t = useT();
  // The phone's Back button backs out of the preview, not out of the chat.
  useBackToClose(onClose);

  const [caption, setCaption] = React.useState(initialCaption);
  const [activeId, setActiveId] = React.useState<string | undefined>(items[0]?.id);
  const captionRef = React.useRef<HTMLTextAreaElement>(null);

  // The big picture follows the batch: a dropped one hands over to its
  // neighbour, rather than leaving a blank where it was.
  const lastIndexRef = React.useRef(0);
  const found = items.findIndex((i) => i.id === activeId);
  const index = found >= 0 ? found : Math.min(lastIndexRef.current, items.length - 1);
  lastIndexRef.current = Math.max(0, index);
  const active = items[index];
  React.useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  React.useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [caption]);

  if (!active) return null;

  const send = () => {
    if (sending) return;
    onSend(caption);
  };

  const roundButton =
    'flex shrink-0 items-center justify-center rounded-full text-white active:bg-white/25';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.imagePreview')}
      data-no-swipe
      className="fixed inset-0 z-50 flex flex-col bg-wa-viewer text-white"
    >
      <div className="safe-top flex shrink-0 items-center px-1 pb-1">
        <button
          type="button"
          aria-label={t('chat.closePreview')}
          onClick={onClose}
          className={cn(roundButton, 'h-10 w-10 hover:bg-white/15')}
        >
          <X width={24} strokeWidth={2} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <img
          src={active.previewUrl}
          alt={active.file.name}
          decoding="async"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="max-h-full max-w-full select-none object-contain"
        />
      </div>

      {items.length > 1 ? (
        <div className="flex shrink-0 gap-2 overflow-x-auto overscroll-contain px-3 py-2 scrollbar-thin">
          {items.map((item, i) => {
            const current = item.id === active.id;
            return (
              <div key={item.id} className="relative shrink-0">
                <button
                  type="button"
                  aria-label={t('composer.photoN', { n: i + 1, total: items.length })}
                  aria-current={current}
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    'block h-14 w-14 overflow-hidden rounded-lg',
                    current ? 'ring-2 ring-white' : 'opacity-70',
                  )}
                >
                  <img
                    src={item.previewUrl}
                    alt=""
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </button>
                {current ? (
                  <button
                    type="button"
                    aria-label={t('composer.dropPhoto')}
                    onClick={() => onRemove(item.id)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-wa-viewer"
                  >
                    <X width={12} strokeWidth={3} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="safe-bottom flex shrink-0 items-end gap-2 px-3 pt-1">
        <button
          type="button"
          aria-label={t('composer.addMore')}
          onClick={onAddMore}
          disabled={sending}
          className={cn(roundButton, 'h-12 w-12 bg-white/15 disabled:opacity-40')}
        >
          <Plus width={24} strokeWidth={2} />
        </button>
        <textarea
          ref={captionRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => {
            // Plain Enter is a newline, as in the message box; Ctrl/Cmd+Enter sends.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={t('composer.captionPlaceholder')}
          className="max-h-28 min-h-[48px] min-w-0 flex-1 resize-none rounded-3xl bg-white/15 px-4 py-3 text-base leading-snug text-white placeholder:text-white/60 focus:outline-none"
        />
        <button
          type="button"
          aria-label={t('chat.send')}
          onClick={send}
          disabled={sending}
          className={cn(roundButton, 'h-12 w-12 bg-wa-accent disabled:cursor-not-allowed')}
        >
          {sending ? <Spinner size={18} /> : <SendHorizonal width={22} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}
