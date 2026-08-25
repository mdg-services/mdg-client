import { Camera, Clock3, ImageIcon, RotateCw } from 'lucide-react';
import * as React from 'react';

import { Button, Spinner, useToast } from '@/components/ui';
import { useSubmitKavachEvidence } from '@/hooks/api/useKavach';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import { resolveFileType } from '@/lib/uploadAttachment';
import { uploadKavachProof } from '@/lib/uploadKavachProof';
import { useAuthStore } from '@/store/auth';
import type { Attachment, KavachItem } from '@dk/shared/types';

import { checkedDateLabel, taskIcon, waitingOn } from './status';

/**
 * The one thing on this screen the dealer can actually do.
 *
 * MDG has asked them for a photograph (or sent the last one back), so this card
 * is a task title, a reason if there is one, and a camera. It has two faces and
 * they must never be confused: the ASK, and the WAIT after they have sent.
 *
 * The wait is not a success state and is not coloured like one. "The dealer sent
 * a photo" and "MDG accepted it" are different facts about different people, and
 * a green tick on the first is a promise the second may not keep — the task can
 * still come back rejected, and a dealer who was shown "done" and then sees it
 * pending again has been lied to by the app, which is the whole failure this
 * model was built to end.
 */
export function EvidenceRequestCard({
  item,
  onNeedChat,
}: {
  item: KavachItem;
  /** Route the dealer to chat when the photo genuinely cannot be sent. */
  onNeedChat?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const submit = useSubmitKavachEvidence();
  // Evidence uploads are scoped to the dealer, not to a chat thread, so the
  // camera no longer waits on a conversation id to resolve.
  const dealerId = useAuthStore((s) => s.user?.dealerId);

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  // Held so a failed POST can be retried WITH the photo that already reached the
  // bucket. Retrying with an empty body would silently downgrade "here is your
  // photo" into "I've done this" — a different claim, about a different fact.
  const [staged, setStaged] = React.useState<Attachment | undefined>(undefined);

  const label = pick(lang, item.labelEn, item.labelHi);
  const wait = waitingOn(item);
  const rejectReason = item.request?.rejectReason;
  const rejected = item.request?.state === 'REJECTED';
  const Icon = taskIcon(item.domain);

  const send = React.useCallback(
    (proof?: Attachment) => {
      submit.mutate(
        { itemId: item.id, proof },
        {
          onSuccess: () =>
            toast.success(t('kavach.photoSent'), {
              description: t('kavach.photoSentDesc'),
            }),
        },
      );
    },
    [item.id, submit, t, toast],
  );

  const noWayToUpload = React.useCallback(() => {
    toast.error(t('kavach.photoAddFailed'), {
      description: t('kavach.photoAddFailedDesc'),
      action: onNeedChat
        ? { label: t('kavach.messageUs'), onClick: onNeedChat }
        : undefined,
    });
  }, [onNeedChat, t, toast]);

  const openPicker = (source: 'camera' | 'gallery') => {
    // Never open a picker whose upload we already know will fail.
    if (!dealerId) {
      noWayToUpload();
      return;
    }
    (source === 'camera' ? cameraRef : galleryRef).current?.click();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset first, or picking the same file twice never fires onChange again
    // and the dealer's second attempt does nothing at all.
    e.target.value = '';
    if (!file) return;
    if (!dealerId) {
      noWayToUpload();
      return;
    }
    // An Android System WebView camera capture hands back a File with an empty
    // MIME. Left alone it presigns as application/octet-stream and the server
    // refuses it, so the dealer is told their photo is not a photo.
    const resolved = resolveFileType(file, { assumeImage: true });
    if (resolved.kind !== 'image') {
      toast.error(t('kavach.notAPhoto'));
      return;
    }
    setUploading(true);
    try {
      const proof = await uploadKavachProof(file, dealerId, resolved.contentType);
      setStaged(proof);
      send(proof);
    } catch {
      // Leave the card in its retry state so the dealer can tap again in place;
      // a toast alone disappears and they cannot tell what happened.
      toast.error(t('kavach.photoUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const inputs = (
    <>
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
    </>
  );

  if (wait === 'SENT') {
    const sentOn = checkedDateLabel(lang, item.request?.submission?.at);
    const proof = item.request?.submission?.proof;
    // An unprompted claim and an answered ask both land here, and they are not
    // the same sentence: one is "you told us", the other "we have your photo".
    const claimed = item.request?.openedBy === 'dealer' && !proof;
    return (
      <div className="rounded-2xl border border-info/30 bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info"
            aria-hidden
          >
            <Clock3 width={20} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug text-text">
              {label}
            </p>
            <p className="mt-1 text-sm font-medium text-info">
              {claimed ? t('kavach.claimSent') : t('kavach.sentWaiting')}
            </p>
            {sentOn ? (
              <p className="mt-0.5 text-xs text-text-muted">
                {t('kavach.sentOn', { date: sentOn })}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-text-muted">
          {t('kavach.sentWaitingDesc')}
        </p>
        {proof?.url && proof.kind === 'image' ? (
          <a
            href={proof.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-[44px] items-center gap-3 rounded-xl px-1 text-sm text-brand active:bg-surface-2"
          >
            <img
              src={proof.url}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover"
            />
            {t('kavach.seeWhatYouSent')}
          </a>
        ) : null}
      </div>
    );
  }

  const busy = submit.isPending || uploading;
  const failed = submit.isError;
  // Nothing to prepare any more: the dealer's own id is in the auth store from
  // login, so the camera is ready the moment the card renders.
  const preparing = false;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-sm',
        failed ? 'border-danger/40' : 'border-warning/40',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning"
          aria-hidden
        >
          <Icon width={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-text">
            {label}
          </p>
          {rejected ? (
            <p className="mt-1 text-sm font-medium text-warning">
              {t('kavach.rejectedTitle')}
            </p>
          ) : null}
        </div>
      </div>

      {/* The admin's own words, verbatim and unedited — they are the only thing
          that tells the dealer what a second photo has to show. */}
      {rejected && rejectReason ? (
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2">
          <p className="text-xs font-medium text-warning">
            {t('kavach.rejectedPreamble')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text">
            {rejectReason}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {failed ? (
          <button
            type="button"
            onClick={() => send(staged)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-danger-soft px-4 text-sm font-medium text-danger"
          >
            <RotateCw width={15} strokeWidth={2} />
            {t('kavach.tapRetry')}
          </button>
        ) : (
          <>
            <Button
              fullWidth
              size="lg"
              onClick={() => openPicker('camera')}
              disabled={preparing}
              loading={busy || preparing}
              leftIcon={
                busy || preparing ? undefined : (
                  <Camera width={16} strokeWidth={2} />
                )
              }
            >
              {preparing
                ? t('kavach.preparing')
                : rejected
                  ? t('kavach.sendAgain')
                  : t('kavach.sendPhoto')}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => openPicker('gallery')}
              disabled={preparing || busy}
              leftIcon={<ImageIcon width={16} strokeWidth={1.75} />}
            >
              {t('kavach.choosePhoto')}
            </Button>
          </>
        )}
      </div>

      {uploading ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-text-muted">
          <Spinner size={12} /> {t('kavach.addingPhoto')}
        </p>
      ) : null}

      {inputs}
    </div>
  );
}
