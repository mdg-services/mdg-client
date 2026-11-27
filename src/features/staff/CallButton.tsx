import { Copy, Phone } from 'lucide-react';

import { useToast } from '@/components/ui';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/**
 * The number as a dialler can take it, or '' when it is not one. Spaces and hyphens are only how a
 * person typed the number ("98765 43210", "98765-43210") and are dropped; after that it must be
 * digits with an optional leading plus, nothing else. Anything else (letters, brackets, a stray
 * `;` or `,` that a dialler would read as a pause or an extra command) is NOT put into a link.
 */
export function dialable(phone: string): string {
  const cleaned = phone.trim().replace(/[\s-]/g, '');
  return /^\+?\d{3,15}$/.test(cleaned) ? cleaned : '';
}

const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-cta text-text shadow-sm active:bg-surface-2';

/**
 * "Call" for a warrior: the phone's own dialler opens with his number (the shell hands a `tel:` link
 * to the dialler, as it does for the helpline on the sign-in screen). It is a 44px button with the
 * name in its spoken label, so a screen reader hears "Call Ramesh" and not "Call" on every row.
 *
 * The number goes into a link ONLY when it is plain digits (see `dialable`). A number that is not
 * (the owner typed a note, an extension, two numbers) is shown as plain text with a Copy button, so
 * nothing odd ever reaches the dialler. `numberShown` says the page already prints the number, so
 * the fallback does not print it twice. Draws nothing without a number.
 */
export function CallButton({
  name,
  phone,
  numberShown = false,
  className,
}: {
  name: string;
  phone?: string;
  numberShown?: boolean;
  className?: string;
}) {
  const t = useT();
  const toast = useToast();
  const raw = phone?.trim() ?? '';
  if (!raw) return null;
  const number = dialable(raw);
  if (number) {
    return (
      <a
        href={`tel:${number}`}
        aria-label={t('warr.row.callName', { name })}
        className={cn(BUTTON, className)}
      >
        <Phone aria-hidden className="h-5 w-5 shrink-0" strokeWidth={2} />
        <span>{t('warr.row.call')}</span>
      </a>
    );
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {numberShown ? null : <p className="min-w-0 break-all text-body text-text">{raw}</p>}
      <button
        type="button"
        aria-label={t('warr.row.copyName', { name })}
        className={cn(BUTTON, 'max-w-full')}
        onClick={async () => {
          if (await copyText(raw)) toast.success(t('logins.copied'));
        }}
      >
        <Copy aria-hidden className="h-5 w-5 shrink-0" strokeWidth={2} />
        <span>{t('warr.row.copy')}</span>
      </button>
    </div>
  );
}
