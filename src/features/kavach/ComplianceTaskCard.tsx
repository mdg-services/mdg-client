import {
  Camera,
  Check,
  FileCheck2,
  FileText,
  RotateCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import type { Attachment, KavachItem } from '@dk/shared/types';

import { friendlyStatus } from './status';

import { Button, Spinner, useToast } from '@/components/ui';
import { useMarkKavachItemDone } from '@/hooks/api/useKavach';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import { uploadAttachment } from '@/lib/uploadAttachment';


function iconFor(domain: KavachItem['domain']): LucideIcon {
  if (domain === 'safety') return ShieldCheck;
  if (domain === 'statutory-license' || domain === 'documentation-display')
    return FileText;
  return FileCheck2;
}

/**
 * A single "Do today" task. Reuses the RecordCard anatomy (rounded-2xl border,
 * rounded-xl icon tile) but holds an inline "Mark done / हो गया" action instead
 * of being a link. Optimistic mark-done with in-place tap-to-retry on failure.
 */
export function ComplianceTaskCard({
  item,
  conversationId,
  conversationLoading = false,
  onNeedChat,
  onDone,
}: {
  item: KavachItem;
  /** Needed to upload proof photos (chat-scoped uploads). */
  conversationId?: string;
  /** While the conversation id is still resolving, the proof flow waits. */
  conversationLoading?: boolean;
  /** Route the dealer to chat when proof upload can't proceed without it. */
  onNeedChat?: () => void;
  onDone?: (item: KavachItem) => void;
}) {
  const toast = useToast();
  const t = useT();
  const lang = useLang();
  const status = friendlyStatus(item.status);
  const Icon = iconFor(item.domain);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const markDone = useMarkKavachItemDone();

  const label = pick(lang, item.labelEn, item.labelHi);
  const notes = pick(
    lang,
    item.notesEn ?? item.notesHi ?? '',
    item.notesHi ?? item.notesEn ?? '',
  );

  const submit = React.useCallback(
    (proof?: Attachment) => {
      markDone.mutate(
        { itemId: item.id, proof },
        { onSuccess: (updated) => onDone?.(updated) },
      );
    },
    [item.id, markDone, onDone],
  );

  const onMarkDone = () => {
    if (item.requiresProof) {
      // The conversation id is still resolving — never silently drop the tap.
      if (conversationLoading) return;
      // Genuinely missing/errored: tell the dealer and offer a way forward.
      if (!conversationId) {
        toast.error(t('kavach.photoAddFailed'), {
          description: t('kavach.photoAddFailedDesc'),
          action: onNeedChat
            ? { label: t('kavach.messageUs'), onClick: onNeedChat }
            : undefined,
        });
        return;
      }
      fileRef.current?.click();
      return;
    }
    submit();
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!conversationId) {
      toast.error(t('kavach.photoAddFailed'), {
        description: t('kavach.photoAddFailedDesc'),
        action: onNeedChat
          ? { label: t('kavach.messageUs'), onClick: onNeedChat }
          : undefined,
      });
      return;
    }
    setUploading(true);
    try {
      const proof = await uploadAttachment(
        { file, kind: 'image' },
        conversationId,
      );
      submit(proof);
    } catch {
      // Upload failed — surface it and leave the card in its retry state so
      // the dealer can tap to try again. Never swallow the error.
      toast.error(t('kavach.photoUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const busy = markDone.isPending || uploading;
  const failed = markDone.isError;
  const preparing = item.requiresProof && conversationLoading;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-sm',
        failed ? 'border-danger/40' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            status.tile,
          )}
          aria-hidden
        >
          <Icon width={20} strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-text">
                {label}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                status.pill,
              )}
            >
              {t(status.labelKey)}
            </span>
          </div>

          {notes ? (
            <p className="mt-1 text-xs text-text-muted">{notes}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        {failed ? (
          // Never a raw error / dead toast: tap-to-retry in place, true state shown.
          <button
            type="button"
            onClick={() => submit()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger"
          >
            <RotateCw width={15} strokeWidth={2} />
            {t('kavach.tapRetry')}
          </button>
        ) : (
          <Button
            fullWidth
            size="lg"
            onClick={onMarkDone}
            disabled={preparing}
            loading={busy || preparing}
            leftIcon={
              busy || preparing ? undefined : item.requiresProof ? (
                <Camera width={16} strokeWidth={2} />
              ) : (
                <Check width={16} strokeWidth={2.25} />
              )
            }
          >
            {preparing
              ? t('kavach.preparing')
              : item.requiresProof
                ? t('kavach.addPhotoMarkDone')
                : t('kavach.markDone')}
          </Button>
        )}
      </div>

      {uploading ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-text-muted">
          <Spinner size={12} /> {t('kavach.addingPhoto')}
        </p>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickPhoto}
      />
    </div>
  );
}
