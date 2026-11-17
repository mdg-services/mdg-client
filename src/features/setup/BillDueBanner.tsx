import { X } from 'lucide-react';
import * as React from 'react';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { isNativeShell } from '@/lib/nativeBridge';

import {
  billBanner,
  canClose,
  formatCountdown,
  hiddenKey,
  hiddenToday,
  showSendAgain,
  type BillBanner,
} from './billBannerView';
import { formatDay, istToday } from './cardView';
import { useOutletSetup, useResendBill } from './useOutletSetup';

/**
 * The thin bill strip at the very top of the owner's app — the chat list and the
 * Support chat (owner, 16 Nov 2026):
 *
 *   बिल · 5 दिन में कभी भी    [फिर से भेजें]  ×
 *
 * No amount (owner, 16 Nov 2026): only when it is due. Every day until the due day it
 * says how many days are left, and the cross hides
 * it for the rest of that day. On the due day it counts down to midnight and stays.
 * After that it says the day has passed. "Send again" sends the same bill to the
 * owner's WhatsApp, SMS and email — never into the app (ADR 0022 §1), and in the
 * phone apps only while the server's switch allows it.
 *
 * `hidden` steps it aside (messages being picked, a search open) without leaving
 * the tree; `disabled` is a thread that never carries it (the managers' group).
 */
export function BillDueBanner({ hidden = false, disabled = false }: { hidden?: boolean; disabled?: boolean }) {
  const q = useOutletSetup({ enabled: !disabled });
  const now = useNow(q.data);
  const banner = disabled ? null : billBanner(q.data, now);
  const [closedOn, setClosedOn] = React.useState<string | null>(() => (banner ? readHidden(banner) : null));
  // A different bill (or the first read arriving) reads its own remembered day.
  const key = banner ? hiddenKey(banner) : null;
  React.useEffect(() => {
    if (banner) setClosedOn(readHidden(banner));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!banner || !q.data || hidden || hiddenToday(banner, closedOn, now)) return null;
  const sendable = showSendAgain(q.data, isNativeShell());
  const close = () => {
    const today = istToday(now);
    writeHidden(banner, today);
    setClosedOn(today);
  };
  return (
    <BannerBar
      banner={banner}
      nextAt={q.data.payment.resend?.nextAt ?? null}
      sendable={sendable}
      onClose={canClose(banner) ? close : null}
      now={now}
    />
  );
}

function BannerBar({
  banner,
  nextAt,
  sendable,
  onClose,
  now,
}: {
  banner: BillBanner;
  nextAt: string | null;
  sendable: boolean;
  onClose: (() => void) | null;
  now: Date;
}) {
  const t = useT();
  const lang = useLang();
  const send = useResendBill();
  // For a few seconds after a press, the line says where the bill went instead.
  const [said, setSaid] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!said) return;
    const id = window.setTimeout(() => setSaid(null), 6_000);
    return () => window.clearTimeout(id);
  }, [said]);

  const urgent = banner.kind !== 'days';
  let text: string;
  if (banner.kind === 'days') {
    text =
      banner.days <= 1
        ? t('billBanner.dueTomorrow')
        : t('billBanner.dueInDays', { n: banner.days });
  } else if (banner.kind === 'countdown') {
    text = t('billBanner.dueToday', { time: formatCountdown(banner.msLeft) });
  } else {
    text = t('billBanner.overdue', { date: formatDay(banner.dueOn, lang) });
  }
  const waiting = nextAt !== null && new Date(nextAt).getTime() > now.getTime();
  const press = () => {
    send.mutate(undefined, {
      onSuccess: (r) => setSaid(sentWords(t, r)),
      onError: (err) =>
        setSaid(err instanceof ApiError && err.status === 429 ? t('billBanner.sentJustNow') : t('billBanner.failed')),
    });
  };
  return (
    <div
      role="status"
      data-bill-banner={banner.kind}
      className={cn(
        'flex shrink-0 items-center gap-2 border-b px-3 py-1',
        urgent ? 'border-danger/20 bg-danger-soft text-danger' : 'border-warning/20 bg-warning-soft text-warning-strong',
      )}
    >
      <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug tabular-nums" aria-live="polite">
        {said ?? text}
      </p>
      {sendable && !said ? (
        <button
          type="button"
          onClick={press}
          disabled={send.isPending || waiting}
          className="min-h-7 shrink-0 rounded-full border border-current px-2.5 text-[12px] font-medium disabled:opacity-50"
        >
          {send.isPending ? t('billBanner.sending') : waiting ? t('billBanner.sentJustNow') : t('billBanner.sendAgain')}
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('billBanner.hide')}
          className="-mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full active:bg-black/5"
        >
          <X width={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** "WhatsApp, SMS और ईमेल पर भेज दिया": only the places it really went. */
function sentWords(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  r: { whatsapp: boolean; sms: boolean; email: boolean },
): string {
  const names = [r.whatsapp ? 'WhatsApp' : null, r.sms ? 'SMS' : null, r.email ? t('billBanner.email') : null].filter(
    (n): n is string => n !== null,
  );
  const and = t('billBanner.and');
  const where = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}`;
  return t('billBanner.sent', { where });
}

/**
 * The clock the banner draws from: every second on the due day (the countdown),
 * every minute otherwise (so a new day, or the end of a wait, shows by itself).
 */
function useNow(view: Parameters<typeof billBanner>[0]): Date {
  const [now, setNow] = React.useState(() => new Date());
  const ticking = billBanner(view, now)?.kind === 'countdown';
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ticking ? 1_000 : 30_000);
    return () => window.clearInterval(id);
  }, [ticking]);
  return now;
}

// Browser storage can be missing or throw (a private window, cleared data): then the
// banner simply shows, which is the safe side.
function readHidden(b: BillBanner): string | null {
  try {
    return window.localStorage.getItem(hiddenKey(b));
  } catch {
    return null;
  }
}

function writeHidden(b: BillBanner, day: string): void {
  try {
    window.localStorage.setItem(hiddenKey(b), day);
  } catch {
    /* the strip is still hidden for this visit */
  }
}
