import { Camera, ImageIcon, X } from 'lucide-react';
import * as React from 'react';

import { Button, Input, useToast } from '@/components/ui';
import {
  staffDraftQueryKey,
  useFinalizeStaffDraft,
} from '@/hooks/api/useStaffDraft';
import { type FlushResult } from '@/hooks/api/useStaffDraftSync';
import { type ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';
import { fmtPoints, istDate } from '@/lib/staff';
import { uploadStaffHardcopy } from '@/lib/uploadStaffHardcopy';
import { useScrollLock } from '@/lib/useScrollLock';
import { useStaffDraftStore, type DraftSyncState } from '@/store/staffDraft';

/**
 * Final-submit sheet. A hardcopy photo of the paper record at the pump is
 * MANDATORY (reconciles hard vs soft copy), captured with the camera or picked
 * from the gallery.
 *
 * The commit is race-safe against the draft autosave (P1):
 *  - the confirm button is disabled while local edits are un-synced
 *    (`dirty || syncState==='saving'`), and offline blocks submit entirely;
 *  - on confirm we first `await flush()` so the server reflects the latest edits
 *    (no stale-draft finalize, no lost edit);
 *  - autosave is suppressed around the commit so no late/queued PUT can resurrect
 *    the draft the server just deleted (no ghost draft / double award);
 *  - a `DRAFT_CHANGED` 409 refetches the draft and keeps the sheet open for
 *    review; `DRAFT_EMPTY` keeps the "add work first" message; on any failure the
 *    draft is preserved for a retry.
 */
export function FinalizeSubmitSheet({
  dealerId,
  totalPoints,
  defaultWorkDate,
  defaultNote,
  dirty,
  syncState,
  flush,
  suppressAutosave,
  onClose,
}: {
  dealerId: string | undefined;
  totalPoints: number;
  defaultWorkDate: string;
  defaultNote?: string;
  dirty: boolean;
  syncState: DraftSyncState;
  flush: () => Promise<FlushResult>;
  suppressAutosave: (on: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const finalize = useFinalizeStaffDraft(dealerId);
  const clearDraft = useStaffDraftStore((s) => s.clearDraft);
  // Lock the StaffPage behind the sheet so dragging the backdrop / overscrolling
  // the sheet body doesn't scroll the page underneath.
  useScrollLock();

  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [workDate, setWorkDate] = React.useState(defaultWorkDate || istDate());
  const [note, setNote] = React.useState(defaultNote ?? '');
  const [submitting, setSubmitting] = React.useState(false);

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);
  const today = istDate();

  const offline = syncState === 'offline';
  const notSynced = dirty || syncState === 'saving';

  // Keep a single object URL for the preview; revoke the old one on change/unmount.
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) setFile(picked);
    // Reset so re-picking the same file still fires onChange.
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!dealerId || !file || submitting) return;
    if (offline) {
      toast.error(t('staff.offlineSubmit'));
      return;
    }
    setSubmitting(true);
    try {
      // 1) Make sure the server has the latest local edits before we commit.
      const flushed = await flush();
      if (!flushed.ok) {
        toast.error(t('staff.offlineSubmit'));
        return;
      }

      // 2) Silence autosave around the commit so no late PUT can resurrect the
      //    draft the server is about to delete.
      suppressAutosave(true);
      try {
        const hardCopyImageKey = await uploadStaffHardcopy(file, dealerId);
        const res = await finalize.mutateAsync({
          hardCopyImageKey,
          workDate,
          note: note.trim() || undefined,
        });
        // 3) Draft is committed and gone server-side — wipe it locally too.
        clearDraft(dealerId);
        suppressAutosave(false);
        toast.success(
          t('staff.finalizeSuccess', {
            points: fmtPoints(res.batch.totalPoints),
          }),
        );
        onClose();
      } catch (err) {
        // Draft is intact (server + local). Resume autosave for a retry.
        suppressAutosave(false);
        const apiErr = err as ApiError;
        const code = apiErr?.code;
        const status = apiErr?.status;
        if (code === 'DRAFT_CHANGED') {
          // A concurrent edit landed — pull the latest and let the user review.
          await queryClient.invalidateQueries({
            queryKey: staffDraftQueryKey(dealerId),
          });
          toast.error(t('staff.draftChanged'));
          // Keep the sheet open with the refreshed lines.
        } else if (code === 'DRAFT_EMPTY' || status === 409) {
          toast.error(t('staff.finalizeEmpty'));
        } else {
          toast.error(t('staff.finalizeFailed'));
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm is unavailable until the draft is fully in sync and a photo is set.
  const submitDisabled = !file || notSynced || offline;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-lg">
        <header className="flex items-center gap-2 border-b border-border px-3 py-3">
          <span className="h-11 w-11" />
          <h2 className="flex-1 text-center text-sm font-semibold text-text">
            {t('staff.finalizeTitle')}
          </h2>
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
          >
            <X width={20} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-brand-soft px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums text-brand">
                {fmtPoints(totalPoints)}
              </p>
              <p className="text-xs text-text-muted">{t('staff.points')}</p>
            </div>

            {/* Mandatory hardcopy photo */}
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold text-text-muted">
                {t('staff.hardcopyPhoto')}
              </p>
              <p className="px-1 text-xs text-text-subtle">
                {t('staff.hardcopyHint')}
              </p>

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPick}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />

              {previewUrl ? (
                <div className="relative overflow-hidden rounded-2xl border border-border">
                  <img
                    src={previewUrl}
                    alt={t('staff.hardcopyPhoto')}
                    draggable={false}
                    className="max-h-64 w-full bg-surface-2 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    aria-label={t('staff.removeLine')}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
                  >
                    <X width={18} strokeWidth={2} />
                  </button>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  leftIcon={<Camera width={18} strokeWidth={1.75} />}
                  onClick={() => cameraRef.current?.click()}
                >
                  {file ? t('staff.retakePhoto') : t('staff.takePhoto')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  leftIcon={<ImageIcon width={18} strokeWidth={1.75} />}
                  onClick={() => galleryRef.current?.click()}
                >
                  {t('staff.choosePhoto')}
                </Button>
              </div>
            </div>

            {/* Day + optional note */}
            <div className="flex flex-col gap-1.5">
              <label className="px-1 text-xs font-semibold text-text-muted">
                {t('staff.give.date')}
              </label>
              <Input
                type="date"
                value={workDate}
                max={today}
                onChange={(e) => setWorkDate(e.target.value || today)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="px-1 text-xs font-semibold text-text-muted">
                {t('staff.finalizeNote')}
              </label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('staff.notePlaceholder')}
              />
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border p-3">
          {offline ? (
            <p className="px-1 text-center text-xs text-warning">
              {t('staff.offlineSubmit')}
            </p>
          ) : notSynced ? (
            <p className="px-1 text-center text-xs text-text-muted">
              {t('staff.waitSaving')}
            </p>
          ) : !file ? (
            <p className="px-1 text-center text-xs text-text-muted">
              {t('staff.photoRequired')}
            </p>
          ) : null}
          <Button
            fullWidth
            size="lg"
            disabled={submitDisabled}
            loading={submitting}
            onClick={handleSubmit}
          >
            {submitting
              ? t('staff.submitting')
              : t('staff.confirmSubmit', { points: fmtPoints(totalPoints) })}
          </Button>
        </footer>
      </div>
    </div>
  );
}
