import type { Attachment } from '@dk/shared/types';
import { FileText, X } from 'lucide-react';

import { formatBytes } from '@/lib/uploadAttachment';

export interface StagedFile {
  id: string;
  file: File;
  previewUrl?: string;
}

export function StagedAttachmentChip({
  staged,
  onRemove,
}: {
  staged: StagedFile;
  onRemove: () => void;
}) {
  const isImage = staged.file.type.startsWith('image/');
  return (
    <div className="group relative flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 pr-8 shadow-sm">
      {isImage && staged.previewUrl ? (
        <img
          src={staged.previewUrl}
          alt={staged.file.name}
          className="h-10 w-10 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
          <FileText width={18} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-text max-w-[140px]">
          {staged.file.name}
        </p>
        <p className="text-[11px] text-text-subtle">
          {formatBytes(staged.file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="absolute right-1 top-1 rounded-full p-1 text-text-muted hover:bg-surface-2"
      >
        <X width={12} strokeWidth={2} />
      </button>
    </div>
  );
}

export function MessageAttachment({
  attachment,
  onOpenImage,
}: {
  attachment: Attachment;
  onOpenImage?: (url: string) => void;
}) {
  if (attachment.kind === 'image' && attachment.url) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage?.(attachment.url!)}
        className="block overflow-hidden rounded-xl border border-border"
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-h-72 w-auto max-w-full object-cover"
        />
      </button>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface"
    >
      <FileText width={18} strokeWidth={1.75} className="text-text-muted" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-text max-w-[200px]">
          {attachment.filename}
        </span>
        <span className="text-[11px] text-text-subtle">
          {formatBytes(attachment.size)}
        </span>
      </span>
    </a>
  );
}
