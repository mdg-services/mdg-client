import { BatteryWarning } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { useT, type MessageKey } from '@/lib/i18n';
import { detectPlatform, isNativeShell, nativePhoneMaker, openNativeAppSettings } from '@/lib/nativeBridge';
import { useDialog } from '@/lib/useDialog';
import { usePushStore } from '@/store/push';
import { STRICT_BATTERY_MAKERS, phoneMakerOf, type PhoneMaker } from '@dk/shared';

/**
 * "Make sure MDG's messages reach you" — the battery-saver steps for phones whose
 * maker stops notifications of apps that are not opened often (ADR 0040 §7).
 *
 * WHY. Xiaomi, Oppo, Vivo, Realme, OnePlus and Samsung phones put an app to
 * sleep to save battery, and a sleeping app's notifications never appear — the
 * dealer has internet, the message is sent, nothing shows. Only the dealer can
 * change it, in the phone's own settings, and the screens differ by maker.
 *
 * WHERE. A card at the top of the chat list, once, for those phones only, while
 * notifications are on (with them off, the "turn on" banner comes first). "Done"
 * puts it away on this phone. Settings keeps a row that opens the same steps.
 */

/** Remembered on this phone only: the card is a nudge, not a record. */
const DONE_KEY = 'dk.batteryGuide.done.v1';

function isDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    window.localStorage.setItem(DONE_KEY, '1');
  } catch {
    // Private storage off: the card comes back next start, which is harmless.
  }
}

/** The maker of this phone, from the app shell or the browser signature; null off Android. */
export function batteryGuideMaker(): PhoneMaker | null {
  if (!isNativeShell() || detectPlatform() !== 'android') return null;
  const maker = phoneMakerOf(nativePhoneMaker()) ?? phoneMakerOf(navigator.userAgent);
  return maker && STRICT_BATTERY_MAKERS.includes(maker) ? maker : null;
}

const STEPS: Record<PhoneMaker, MessageKey[]> = {
  xiaomi: ['battery.step.openSettings', 'battery.step.xiaomiAutostart', 'battery.step.xiaomiSaver', 'battery.step.popUp', 'battery.step.lockRecent'],
  oppo: ['battery.step.openSettings', 'battery.step.colorosBackground', 'battery.step.colorosAutoLaunch', 'battery.step.popUp'],
  realme: ['battery.step.openSettings', 'battery.step.colorosBackground', 'battery.step.colorosAutoLaunch', 'battery.step.popUp'],
  oneplus: ['battery.step.openSettings', 'battery.step.colorosBackground', 'battery.step.colorosAutoLaunch', 'battery.step.popUp'],
  vivo: ['battery.step.openSettings', 'battery.step.vivoBackground', 'battery.step.vivoAutostart', 'battery.step.popUp', 'battery.step.lockRecent'],
  samsung: ['battery.step.openSettings', 'battery.step.samsungUnrestricted', 'battery.step.samsungSleeping', 'battery.step.popUp'],
  motorola: ['battery.step.openSettings', 'battery.step.genericUnrestricted', 'battery.step.popUp'],
  other: ['battery.step.openSettings', 'battery.step.genericUnrestricted', 'battery.step.popUp'],
};

const MAKER_NAME: Record<PhoneMaker, string> = {
  xiaomi: 'Xiaomi / Redmi / POCO',
  oppo: 'Oppo',
  vivo: 'Vivo / iQOO',
  realme: 'Realme',
  oneplus: 'OnePlus',
  samsung: 'Samsung',
  motorola: 'Motorola',
  other: '',
};

function Steps({ maker }: { maker: PhoneMaker }) {
  const t = useT();
  return (
    <ol className="ml-5 list-decimal space-y-1 text-[14px] leading-snug text-wa-bar-text">
      {STEPS[maker].map((key) => (
        <li key={key}>{t(key)}</li>
      ))}
    </ol>
  );
}

/** The card on the chat list. Nothing at all unless this phone needs it and it is not done. */
export function BatteryGuideCard() {
  const t = useT();
  const pushState = usePushStore((s) => s.pushState);
  const [done, setDone] = React.useState(isDone);
  const [open, setOpen] = React.useState(false);
  const maker = React.useMemo(batteryGuideMaker, []);
  if (!maker || done || pushState !== 'on') return null;

  const finish = () => {
    markDone();
    setDone(true);
  };

  return (
    <section
      aria-label={t('battery.title')}
      className="mx-3 mb-1 mt-1 shrink-0 rounded-2xl bg-wa-row-active py-3 pl-4 pr-3"
    >
      <div className="flex items-start gap-3">
        <BatteryWarning width={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-wa-bar-icon" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-wa-bar-text">{t('battery.title')}</p>
          <p className="text-[13px] leading-snug text-wa-meta">
            {t('battery.why', { maker: MAKER_NAME[maker] })}
          </p>
          {open ? (
            <div className="mt-2">
              <Steps maker={maker} />
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {open ? (
              <>
                <Button size="sm" onClick={openNativeAppSettings}>
                  {t('battery.openSettings')}
                </Button>
                <Button size="sm" variant="ghost" onClick={finish}>
                  {t('battery.done')}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => setOpen(true)}>
                  {t('battery.show')}
                </Button>
                <Button size="sm" variant="ghost" onClick={finish}>
                  {t('battery.later')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The same steps as a sheet, from Settings → "Messages not arriving?". */
export function BatteryGuideSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const panelRef = useDialog(onClose);
  const maker = batteryGuideMaker() ?? 'other';
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
        aria-label={t('battery.title')}
        tabIndex={-1}
        className="relative mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-wa-bar px-6 pb-4 pt-5 shadow-lg outline-none safe-bottom animate-in"
      >
        <p className="text-[17px] font-medium text-wa-bar-text">{t('battery.title')}</p>
        <p className="text-[14px] leading-snug text-wa-meta">
          {maker === 'other' ? t('battery.whyAny') : t('battery.why', { maker: MAKER_NAME[maker] })}
        </p>
        <Steps maker={maker} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={openNativeAppSettings}>
            {t('battery.openSettings')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('battery.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}
