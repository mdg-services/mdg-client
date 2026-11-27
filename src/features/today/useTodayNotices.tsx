import * as React from 'react';

import type { NoticesRowProps } from '@/components/kit';
import { BatteryGuideSheet, batteryGuideMaker } from '@/features/push/BatteryGuide';
import { billBanner, formatCountdown, showSendAgain } from '@/features/setup/billBannerView';
import { useResendBill } from '@/features/setup/useOutletSetup';
import { requestPushPermission } from '@/hooks/usePushBridge';
import { ApiError } from '@/lib/api';
import { daysUntil, fmtDay } from '@/lib/fmt';
import { useLang, useT, type TFunction } from '@/lib/i18n';
import { isNativeShell, openNativeAppSettings } from '@/lib/nativeBridge';
import { usePushStore } from '@/store/push';
import type { OutletSetupView, SetupBillResendResult } from '@dk/shared/types';

import { useDueBill } from './useDueBill';

/** Remembered on this phone only (the same key the battery card on the chat list used). */
const BATTERY_DONE_KEY = 'dk.batteryGuide.done.v1';

function batteryDone(): boolean {
  try {
    return window.localStorage.getItem(BATTERY_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markBatteryDone(): void {
  try {
    window.localStorage.setItem(BATTERY_DONE_KEY, '1');
  } catch {
    /* the notice comes back next start, which is harmless */
  }
}

/** "WhatsApp, SMS and email": only the places the bill really went. */
function sentWords(t: TFunction, r: Pick<SetupBillResendResult, 'whatsapp' | 'sms' | 'email'>): string {
  const names = [r.whatsapp ? 'WhatsApp' : null, r.sms ? 'SMS' : null, r.email ? t('billBanner.email') : null].filter(
    (n): n is string => n !== null,
  );
  const and = t('billBanner.and');
  const where = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}`;
  return t('billBanner.sent', { where });
}

/**
 * The three strips a dealer used to find above the page (the bill, notifications off, the battery
 * help) as the rows of ONE notices line (spec 4.1). Nothing is drawn when there is nothing to say.
 *
 *  - The bill says only the days (no amount: owner, 16 Nov 2026; and never a way to pay, ADR 0022).
 *    "Send again" sends the same bill OUTSIDE the app, and only where the server allows it
 *    (`payment.resend`, and inside the phone apps only while its `inApp` switch is on). Where it is
 *    not allowed the bill is plain text.
 *  - A live pump's monthly bill comes from the bills list (`useDueBill`) and says only its days.
 *  - Notifications off keeps its button: ask again while the phone allows it, else the phone's Settings.
 *  - The battery help opens its steps in a sheet, and is put away once the sheet has been read.
 */
export function useTodayNotices(setup: OutletSetupView | undefined, now: Date, isOwner = false): {
  notices: NoticesRowProps['notices'];
  /** The battery steps, drawn while they are open. Render it once, anywhere in the page. */
  sheet: React.ReactNode;
} {
  const t = useT();
  const lang = useLang();
  const send = useResendBill();
  const dueBill = useDueBill(isOwner);
  const pushState = usePushStore((s) => s.pushState);
  const canAskAgain = usePushStore((s) => s.canAskAgain);
  const [said, setSaid] = React.useState<string | null>(null);
  const [batteryOpen, setBatteryOpen] = React.useState(false);
  const [batteryAway, setBatteryAway] = React.useState(batteryDone);
  const maker = React.useMemo(batteryGuideMaker, []);

  // What a press said stays for a few seconds, then the line is the bill's again.
  React.useEffect(() => {
    if (!said) return;
    const id = window.setTimeout(() => setSaid(null), 6_000);
    return () => window.clearTimeout(id);
  }, [said]);

  const notices: NoticesRowProps['notices'] = [];

  const bill = billBanner(setup, now);
  if (bill && setup) {
    let text: string;
    if (bill.kind === 'days') {
      text = bill.days <= 1 ? t('billBanner.dueTomorrow') : t('billBanner.dueInDays', { n: bill.days });
    } else if (bill.kind === 'countdown') {
      text = t('billBanner.dueToday', { time: formatCountdown(bill.msLeft) });
    } else {
      text = t('billBanner.overdue', { date: fmtDay(bill.dueOn, lang, now) });
    }
    const nextAt = setup.payment.resend?.nextAt ?? null;
    const waiting = nextAt !== null && new Date(nextAt).getTime() > now.getTime();
    const sendable = showSendAgain(setup, isNativeShell());
    const press = () => {
      send.mutate(undefined, {
        onSuccess: (r) => setSaid(sentWords(t, r)),
        onError: (err) =>
          setSaid(err instanceof ApiError && err.status === 429 ? t('billBanner.sentJustNow') : t('billBanner.failed')),
      });
    };
    notices.push({
      id: 'bill',
      text: said ?? text,
      ...(sendable && !said && !waiting && !send.isPending
        ? { action: { label: t('billBanner.sendAgain'), onPress: press } }
        : {}),
    });
  }

  // A live pump has no first-bill banner: its monthly bill is in the bills list. Days only, plain text,
  // no button, no way to pay (ADR 0022). Left out when the first-bill line above already says it.
  if (!bill && dueBill) {
    const left = daysUntil(dueBill.dueOn, now);
    if (left !== null) {
      notices.push({
        id: 'bill',
        text:
          left < 0
            ? t('today.notice.billLate', { date: fmtDay(dueBill.dueOn, lang, now) })
            : left === 0
              ? t('today.notice.billToday')
              : left === 1
                ? t('today.notice.billTomorrow')
                : t('today.notice.billIn', { n: left }),
      });
    }
  }

  if (pushState === 'off') {
    notices.push({
      id: 'push',
      text: t('push.offTitle'),
      action: {
        label: canAskAgain ? t('push.askTurnOn') : t('push.openSettings'),
        onPress: () => (canAskAgain ? requestPushPermission() : openNativeAppSettings()),
      },
    });
  }

  if (maker && !batteryAway && pushState === 'on') {
    notices.push({
      id: 'battery',
      text: t('battery.title'),
      action: { label: t('battery.show'), onPress: () => setBatteryOpen(true) },
    });
  }

  const sheet = batteryOpen ? (
    <BatteryGuideSheet
      onClose={() => {
        markBatteryDone();
        setBatteryAway(true);
        setBatteryOpen(false);
      }}
    />
  ) : null;

  return { notices, sheet };
}
