import { Check } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import type { AutopayStopReason, DealerAutopay } from '@dk/shared/types';

import { isNoAutopay, useStopAutopay } from './api';
import {
  STOP_REASONS,
  STOP_REASON_KEY,
  dialogBody,
  dialogTitleKey,
  helpLineKey,
  inProgressLine,
  keepLabelKey,
  stopBody,
  stopLabelKey,
  toggleReason,
  wasAlreadyOff,
} from './autopayView';

/**
 * "Stop autopay?" — one confirm, and nothing else standing between the owner and
 * the stop.
 *
 * The shape is the log-out confirm's (`role=alertdialog`, `useDialog`), and so
 * is its way out: Back, Escape and the backdrop all mean KEEP. What it leaves
 * out is the point. India's dark-patterns rules (CCPA, 2023) ban a long or
 * hidden cancel and guilt copy, so there is no second "are you sure", no
 * countdown, no offer to talk them out of it, and the reason is a row of chips
 * that is never needed: none is picked at first, a tap on the picked one clears
 * it, and the button works either way. The effort to keep the dealer goes into
 * a phone call after the stop, not into this screen.
 *
 * Nothing is shown as done before the server says so. While the request is out
 * both buttons are off and Back/Escape/backdrop do nothing; on a failure the
 * dialog stays open with a red line and the button works again; on success the
 * toast and the flip to the Off screen follow `onDone`.
 *
 * The buttons are stacked and full width: side by side, the Hindi labels do not
 * fit at 320px. There is never a bare "Cancel" — the way out says what it keeps.
 */
export function StopAutopayDialog({
  autopay,
  onKeep,
  onDone,
}: {
  autopay: DealerAutopay;
  /** The owner chose to keep it (Back, Escape, the backdrop or the button). */
  onKeep: () => void;
  /** The server has stopped it (or found it already gone): close the dialog. */
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const openChat = useOpenMyChat();
  const stop = useStopAutopay();
  const [reason, setReason] = React.useState<AutopayStopReason | null>(null);
  const [failed, setFailed] = React.useState(false);
  const saving = stop.isPending;

  // Once the request is out there is nothing to take back, so leaving the dialog
  // then would only hide an answer that is still coming.
  const keep = () => {
    if (!saving) onKeep();
  };
  const panelRef = useDialog(keep);

  const onStop = async () => {
    setFailed(false);
    const sentAt = Date.now();
    try {
      const result = await stop.mutateAsync(stopBody(reason));
      toast.success(
        t(wasAlreadyOff(result.autopay, sentAt) ? 'autopay.toast.alreadyOff' : 'autopay.toast.stopped'),
      );
      onDone();
    } catch (err) {
      if (isNoAutopay(err)) {
        // Nothing left to stop. The status is read again (see `useStopAutopay`).
        toast.success(t('autopay.toast.alreadyOff'));
        onDone();
        return;
      }
      setFailed(true);
    }
  };

  const askInChat = () => {
    // Close first, then go, so the dialog's history entry is unwound and Back
    // from the chat does not land on a dialog that is no longer there.
    keep();
    afterOverlayCloses(openChat);
  };

  const inProgress = inProgressLine(t, autopay);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={keep}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="autopay-stop-title"
        aria-describedby="autopay-stop-desc"
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-wa-bar p-5 shadow-lg outline-none animate-in"
      >
        <p id="autopay-stop-title" className="text-[18px] font-medium text-wa-bar-text">
          {t(dialogTitleKey(autopay.state))}
        </p>
        <div id="autopay-stop-desc" className="mt-2 flex flex-col gap-2 text-[15px]">
          {inProgress ? <p className="font-medium text-wa-bar-text">{inProgress}</p> : null}
          <p className="text-wa-meta">{dialogBody(t, lang, autopay)}</p>
        </div>

        <div role="group" aria-labelledby="autopay-stop-why" className="mt-4">
          <p id="autopay-stop-why" className="text-[14px] text-wa-meta">
            {t('autopay.dialog.reasonLabel')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STOP_REASONS.map((r) => {
              const picked = reason === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={picked}
                  disabled={saving}
                  onClick={() => setReason((current) => toggleReason(current, r))}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-left text-[15px] text-wa-bar-text disabled:opacity-70',
                    picked
                      ? 'border-wa-accent bg-wa-accent/10 font-medium'
                      : 'border-border-strong active:bg-wa-row-active',
                  )}
                >
                  {picked ? <Check width={16} height={16} strokeWidth={2.25} aria-hidden /> : null}
                  {t(STOP_REASON_KEY[r])}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={askInChat}
          className="mt-3 min-h-[44px] w-full py-2 text-left text-[15px] font-medium text-wa-accent disabled:opacity-70"
        >
          {t(helpLineKey(autopay))}
        </button>

        {/* The buttons stay on screen however long the words are: at 320px in Hindi
            the panel scrolls, and a Stop below the fold would be a hidden stop. The
            red line sits with them for the same reason — it must be seen. */}
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-3 bg-wa-bar px-5 pb-5 pt-2">
          {failed ? (
            <p role="alert" className="mb-2 text-[15px] font-medium text-danger">
              {t('autopay.dialog.failed')}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              size="lg"
              fullWidth
              disabled={saving}
              onClick={() => void onStop()}
            >
              {saving ? t('autopay.dialog.saving') : t(stopLabelKey(autopay.state))}
            </Button>
            <Button variant="ghost" size="lg" fullWidth disabled={saving} onClick={keep}>
              {t(keepLabelKey(autopay.state))}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
