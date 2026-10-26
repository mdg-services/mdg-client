import { BellOff, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { requestPushPermission } from '@/hooks/usePushBridge';
import { useT } from '@/lib/i18n';
import { openNativeAppSettings } from '@/lib/nativeBridge';
import {
  isPushNoticeSnoozed,
  snoozePushNotice,
  usePushStore,
  type PushNoticeKind,
} from '@/store/push';

/**
 * The one quiet reminder about notifications, at the top of the chat list.
 *
 * Two shapes, never both:
 *
 *  - `ask`: the phone has never been asked. A short card says what the dealer
 *    gets, with the button that lets the phone show its prompt. An iPhone shows
 *    that prompt exactly once, so the dealer should know what they are saying
 *    yes to before it appears — not meet it cold on the first screen.
 *  - `off`: the phone said no. Nothing can be asked again from here, so it is a
 *    single slim line that points at the phone's Settings.
 *
 * Both snooze when put away (`PUSH_SNOOZE_DAYS`) rather than vanish for good, and
 * neither exists at all in a browser, in Expo Go, or in an older shell that
 * never says where permission stands.
 */
export function PushNotice() {
  const pushState = usePushStore((s) => s.pushState);
  // Read once, then held: putting the reminder away must hide it on the spot,
  // not on the next visit to the list.
  const [snoozed, setSnoozed] = React.useState<Record<PushNoticeKind, boolean>>(() => ({
    ask: isPushNoticeSnoozed('ask'),
    off: isPushNoticeSnoozed('off'),
  }));
  const putAway = (kind: PushNoticeKind) => {
    snoozePushNotice(kind);
    setSnoozed((prev) => ({ ...prev, [kind]: true }));
  };

  if (pushState === 'ask' && !snoozed.ask) {
    return <AskCard onNotNow={() => putAway('ask')} />;
  }
  if (pushState === 'off' && !snoozed.off) {
    return <OffNotice onDismiss={() => putAway('off')} />;
  }
  return null;
}

function AskCard({ onNotNow }: { onNotNow: () => void }) {
  const t = useT();
  return (
    <section
      aria-label={t('push.askTitle')}
      className="mx-3 mb-1 mt-1 shrink-0 rounded-2xl bg-wa-row-active px-4 py-3"
    >
      <p className="text-[15px] font-medium text-wa-bar-text">{t('push.askTitle')}</p>
      <p className="mt-0.5 text-[14px] text-wa-meta">{t('push.askDesc')}</p>
      <div className="mt-3 flex items-center gap-2">
        {/* The phone's prompt is the next thing on screen. The card stays until
            the answer lands (a token, or a refusal) and the state changes. */}
        <Button size="sm" onClick={() => requestPushPermission()}>
          {t('push.askTurnOn')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onNotNow}>
          {t('push.askNotNow')}
        </Button>
      </div>
    </section>
  );
}

function OffNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  return (
    <section
      aria-label={t('push.offTitle')}
      className="mx-3 mb-1 mt-1 flex shrink-0 items-center gap-3 rounded-2xl bg-wa-row-active py-2 pl-4 pr-1"
    >
      <BellOff width={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-wa-bar-icon" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-wa-bar-text">{t('push.offTitle')}</p>
        <p className="text-[13px] leading-snug text-wa-meta">{t('push.offDesc')}</p>
        <button
          type="button"
          onClick={() => openNativeAppSettings()}
          className="mt-1 min-h-8 text-[14px] font-medium text-wa-accent-strong underline underline-offset-4"
        >
          {t('push.openSettings')}
        </button>
      </div>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onDismiss}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-bar-icon active:bg-wa-divider"
      >
        <X width={18} strokeWidth={2} />
      </button>
    </section>
  );
}
