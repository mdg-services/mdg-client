import { Bell, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useT , useLang } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import { useDialog } from '@/lib/useDialog';
import { useLargeText } from '@/lib/useLargeText';

export interface NoticesRowProps {
  notices: { id: string; text: string; action?: { label: string; onPress: () => void } }[];
}

/**
 * The notices a dealer used to find as four strips above the page (the bill, notifications off,
 * the battery help), folded into ONE line that opens a sheet. One notice shows its own words on the
 * line; several show a count. In the phone shell the bill notice is plain text with no action
 * (ADR 0022): the caller leaves `action` off, and nothing here adds one. Nothing is drawn when
 * there is nothing to say.
 */
export function NoticesRow({ notices }: NoticesRowProps) {
  const t = useT();
  const lang = useLang();
  const large = useLargeText();
  const [open, setOpen] = React.useState(false);
  if (notices.length === 0) return null;
  const line = notices.length === 1 ? notices[0]!.text : tnIn(lang, 'kit.notices', notices.length);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'flex w-full rounded-lg border border-border bg-surface px-3 text-left text-body text-text shadow-sm active:bg-surface-2',
          // Beside the words the bell and the arrow take 3 rem of a 200%-text line and leave a word or two
          // per row. At large text they move to a row of their own above the words, so the words use the
          // whole width.
          large ? 'min-h-tap flex-col items-stretch gap-1 py-2' : 'min-h-11 items-center gap-2 py-1.5',
        )}
      >
        {large ? (
          <span className="flex items-center justify-between" aria-hidden>
            <Bell className="h-5 w-5 shrink-0 text-text-muted" strokeWidth={1.75} />
            <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle rtl:rotate-180" />
          </span>
        ) : (
          <Bell aria-hidden className="h-5 w-5 shrink-0 text-text-muted" strokeWidth={1.75} />
        )}
        <span className="min-w-0 flex-1 break-words">{line}</span>
        {large ? null : <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />}
      </button>
      {open ? <NoticesSheet notices={notices} title={t('kit.notices.title')} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NoticesSheet({
  notices,
  title,
  onClose,
}: {
  notices: NoticesRowProps['notices'];
  title: string;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useDialog(onClose);
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
        className="safe-bottom animate-in relative mx-auto flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-t-xl bg-surface px-4 pt-4 shadow-lg outline-none"
      >
        <h2 className="text-heading text-text">{title}</h2>
        <ul className="mt-2 divide-y divide-border">
          {notices.map((n) => (
            <li key={n.id} className="flex flex-col items-start gap-2 py-3">
              <p className="break-words text-body text-text">{n.text}</p>
              {n.action ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    n.action!.onPress();
                  }}
                >
                  {n.action.label}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Button variant="secondary" fullWidth onClick={onClose} className="mb-1 mt-2">
          {t('kit.close')}
        </Button>
      </div>
    </div>
  );
}
