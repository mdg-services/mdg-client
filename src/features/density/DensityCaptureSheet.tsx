import { RotateCw } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, useToast } from '@/components/ui';
import { densityDayLabel, useMarkDensityDay } from '@/hooks/api/useDensity';
import { type ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { uploadDensityPhoto } from '@/lib/uploadDensityPhoto';
import { useBackToClose } from '@/lib/useBackToClose';
import { useScrollLock } from '@/lib/useScrollLock';
import { useAuthStore } from '@/store/auth';
import type { TtRegisterPhotoInput } from '@dk/shared/schemas';

/**
 * Is the phone on a network right now?
 *
 * Only used to say so in words before the dealer taps Send. The client owns no
 * offline queue — the native shell draws its own offline screen over the whole
 * WebView — so this is here to replace a send that fails silently with a
 * sentence that explains why it will not go.
 */
function useOnline(): boolean {
  const [online, setOnline] = React.useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/**
 * "Is this page readable?" — the one confirmation between the camera and the
 * register being marked done for the day.
 *
 * THE BUG THIS IS BUILT NOT TO REPEAT
 * -----------------------------------
 * Sending is two steps: the photo goes to the bucket, then the day is marked
 * against the key that came back. The Kavach proof card retries the second step
 * with nothing in hand, so a mark that failed after a successful upload silently
 * drops the photo the dealer just took and uploads it all over again. Here the
 * photo IS the deliverable and the dealer is on 2G, so the key is kept in state
 * ({@link uploaded}) and Send again resumes at the mark — a failed mark never
 * costs a second upload.
 *
 * No progress bar. `fetch` has no upload-progress event, so a bar here would be
 * an animation pretending to know something; a spinner and "Sending your photo…"
 * are the honest version.
 */
export function DensityCaptureSheet({
  file,
  businessDate,
  onClose,
  onRetake,
  onSent,
}: {
  /** The photo the dealer just picked or took. */
  file: File;
  /** The IST day it marks, `YYYY-MM-DD`. */
  businessDate: string;
  onClose: () => void;
  /**
   * Drop this photo and go straight back to the camera for the same day. It
   * runs in the card, which owns the file input — a picker must be opened
   * inside the tap that asked for it.
   */
  onRetake: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const dealerId = useAuthStore((s) => s.user?.dealerId);
  const mark = useMarkDensityDay();
  // The sheet covers the page; without this the page scrolls behind it when the
  // backdrop is dragged.
  useScrollLock();
  // The phone's Back button closes the sheet, not the screen behind it.
  useBackToClose(onClose);

  const online = useOnline();
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** Held across a retry: the bytes are already in the bucket. */
  const [uploaded, setUploaded] = React.useState<TtRegisterPhotoInput | null>(
    null,
  );
  const [failure, setFailure] = React.useState<'none' | 'retryable' | 'refused'>(
    'none',
  );

  // One object URL for the preview, revoked when the file changes and again on
  // unmount — a low-RAM phone otherwise holds the decoded bitmap for the life of
  // the session.
  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const send = async () => {
    if (busy || !online) return;
    if (!dealerId) {
      // A dealer token always carries a dealerId; if it somehow does not, there
      // is nothing to presign against and no amount of tapping will fix it.
      setFailure('refused');
      return;
    }
    setBusy(true);
    setFailure('none');
    try {
      const photo = uploaded ?? (await uploadDensityPhoto(file, dealerId));
      // Record it before the mark is attempted, so a mark that fails leaves the
      // key behind for the retry.
      setUploaded(photo);
      await mark.mutateAsync({ businessDate, photo });
      toast.success(t('density.doneToast'), {
        description: t('density.doneToastDesc'),
      });
      onSent();
      onClose();
    } catch (err) {
      const status = (err as ApiError)?.status;
      // A 4xx is a decision, not a hiccup — the day is out of the window, or the
      // service was switched off underneath them. Sending again would fail the
      // same way, so the sheet offers a person instead of a dead button.
      setFailure(
        typeof status === 'number' && status >= 400 && status < 500
          ? 'refused'
          : 'retryable',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div
        className={cn(
          'relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border bg-surface shadow-lg',
          failure === 'none' ? 'border-border' : 'border-danger/40',
        )}
      >
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-3">
          <p className="text-[15px] font-semibold text-text">
            {densityDayLabel(lang, businessDate, 'full')}
          </p>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt={t('density.todayTitle')}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="mt-3 max-h-[52vh] w-full rounded-xl bg-surface-2 object-contain"
            />
          ) : null}

          <p className="mt-3 text-sm text-text-muted">{t('density.readable')}</p>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border p-3">
          {failure !== 'none' ? (
            <div className="rounded-xl bg-danger-soft px-3 py-2">
              <p className="text-sm font-medium text-danger">
                {t('density.failedTitle')}
              </p>
              <p className="mt-0.5 text-xs text-danger">
                {failure === 'retryable'
                  ? t('density.failedDesc')
                  : t('common.helpDesc')}
              </p>
            </div>
          ) : null}

          {/* Rendered beside the failure block, never instead of it. The retry
              pill below is disabled while the phone is off the network, and
              "Tap to send it again" over a faded button that swallows every tap
              is the disabled mystery this sentence exists to prevent. */}
          {!online ? (
            <p className="px-1 text-center text-xs text-warning">
              {t('density.offline')}
            </p>
          ) : null}

          {failure === 'refused' ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => navigate('/chat')}
            >
              {t('kavach.messageUs')}
            </Button>
          ) : failure === 'retryable' ? (
            // In-place tap-to-retry rather than a toast that leaves nothing to
            // press — and it resumes at the mark, not at the upload.
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !online}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger disabled:opacity-70"
            >
              <RotateCw width={15} strokeWidth={2} />
              {busy ? t('density.sending') : t('density.sendAgain')}
            </button>
          ) : (
            <Button
              size="lg"
              fullWidth
              loading={busy}
              disabled={!online}
              onClick={() => void send()}
            >
              {busy ? t('density.sending') : t('density.sendThis')}
            </Button>
          )}

          <Button
            variant="ghost"
            size="lg"
            fullWidth
            disabled={busy}
            onClick={onRetake}
          >
            {t('density.takeAgain')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
