import { BellOff } from 'lucide-react';

import { Button } from '@/components/ui';
import { requestPushPermission } from '@/hooks/usePushBridge';
import { useT } from '@/lib/i18n';
import { openNativeAppSettings } from '@/lib/nativeBridge';
import { usePushStore } from '@/store/push';

/**
 * The banner at the top of the chat list while the phone has notifications off.
 *
 * The phone is asked on the first start (`usePushBridge`), so there is no card
 * before it. If the answer was no, this stays up — it cannot be put away — with
 * one button: "Turn on" asks again while the phone still allows that, and "Open
 * settings" takes over once it will not (an iPhone after one refusal, Android
 * after "don't ask again"). It goes the moment a token arrives.
 *
 * It does not exist at all in a browser, in Expo Go, or in an older shell that
 * never says where permission stands.
 */
export function PushNotice() {
  const pushState = usePushStore((s) => s.pushState);
  const canAskAgain = usePushStore((s) => s.canAskAgain);
  const t = useT();
  if (pushState !== 'off') return null;

  return (
    <section
      aria-label={t('push.offTitle')}
      className="mx-3 mb-1 mt-1 flex shrink-0 items-center gap-3 rounded-2xl bg-wa-row-active py-2 pl-4 pr-3"
    >
      <BellOff width={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-wa-bar-icon" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-wa-bar-text">{t('push.offTitle')}</p>
        <p className="text-[13px] leading-snug text-wa-meta">
          {canAskAgain ? t('push.offDescAsk') : t('push.offDesc')}
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => (canAskAgain ? requestPushPermission() : openNativeAppSettings())}
      >
        {canAskAgain ? t('push.askTurnOn') : t('push.openSettings')}
      </Button>
    </section>
  );
}
