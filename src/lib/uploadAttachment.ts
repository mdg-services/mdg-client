import type { Attachment, AttachmentKind, PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';

/** A locally-prepared attachment, ready to upload and attach to a message. */
export interface OutgoingAttachment {
  file: File;
  kind: AttachmentKind;
  /** Voice-note length in ms; only set for audio. */
  durationMs?: number;
}

export function attachmentKindFor(contentType: string): AttachmentKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

export async function uploadAttachment(
  item: OutgoingAttachment,
  conversationId: string,
): Promise<Attachment> {
  const { file, durationMs } = item;
  const contentType = file.type || 'application/octet-stream';
  const presign = await api.post<PresignUploadResponse>('/v1/uploads/sign', {
    filename: file.name,
    contentType,
    size: file.size,
    scope: 'chat',
    conversationId,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  return {
    storageKey: presign.storageKey,
    filename: file.name,
    contentType,
    size: file.size,
    kind: item.kind,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format a millisecond duration as m:ss (e.g. 1:07). */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
