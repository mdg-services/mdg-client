import type { Attachment, PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';

function attachmentKind(contentType: string): 'image' | 'file' {
  return contentType.startsWith('image/') ? 'image' : 'file';
}

export async function uploadAttachment(
  file: File,
  conversationId: string,
): Promise<Attachment> {
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
    kind: attachmentKind(contentType),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
