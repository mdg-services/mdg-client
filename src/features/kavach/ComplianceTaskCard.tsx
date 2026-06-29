import type { Attachment, KavachItem } from '@dk/shared/types';
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

import { Button, Spinner } from '@/components/ui';
import { useMarkKavachItemDone } from '@/hooks/api/useKavach';
import { cn } from '@/lib/cn';
import { uploadAttachment } from '@/lib/uploadAttachment';

import { friendlyStatus } from './status';

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
  onDone,
}: {
  item: KavachItem;
  /** Needed to upload proof photos (chat-scoped uploads). */
  conversationId?: string;
  onDone?: (item: KavachItem) => void;
}) {
  const status = friendlyStatus(item.status);
  const Icon = iconFor(item.domain);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const markDone = useMarkKavachItemDone();

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
      fileRef.current?.click();
      return;
    }
    submit();
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!conversationId) return;
    setUploading(true);
    try {
      const proof = await uploadAttachment(
        { file, kind: 'image' },
        conversationId,
      );
      submit(proof);
    } finally {
      setUploading(false);
    }
  };

  const busy = markDone.isPending || uploading;
  const failed = markDone.isError;

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
              <p className="truncate text-[15px] font-semibold leading-snug text-text">
                {item.labelEn}
              </p>
              <p className="truncate text-[13px] text-text-muted">
                {item.labelHi}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                status.pill,
              )}
            >
              {status.labelEn} / {status.labelHi}
            </span>
          </div>

          {item.notesEn ? (
            <p className="mt-1 text-xs text-text-muted">{item.notesEn}</p>
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
            Didn&apos;t save — tap to try again / फिर से दबाएं
          </button>
        ) : (
          <Button
            fullWidth
            size="lg"
            onClick={onMarkDone}
            loading={busy}
            leftIcon={
              busy ? undefined : item.requiresProof ? (
                <Camera width={16} strokeWidth={2} />
              ) : (
                <Check width={16} strokeWidth={2.25} />
              )
            }
          >
            {item.requiresProof
              ? 'Add photo & mark done / फोटो डालकर हो गया'
              : 'Mark done / हो गया'}
          </Button>
        )}
      </div>

      {uploading ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-text-muted">
          <Spinner size={12} /> Adding your photo / फोटो जोड़ रहे हैं…
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
