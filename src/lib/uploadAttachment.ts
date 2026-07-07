import type { Attachment, AttachmentKind, PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';

/** A locally-prepared attachment, ready to upload and attach to a message. */
export interface OutgoingAttachment {
  file: File;
  kind: AttachmentKind;
  /**
   * Concrete MIME resolved at pick time. Prefer this over `file.type` on upload:
   * Android System WebView pickers frequently hand back a File with an EMPTY
   * `type`, and we recover the real one from the extension (see resolveFileType).
   */
  contentType?: string;
  /** Voice-note length in ms; only set for audio. */
  durationMs?: number;
}

export function attachmentKindFor(contentType: string): AttachmentKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Extension → MIME fallbacks for when the browser reports an empty File.type. */
const IMAGE_EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};
const AUDIO_EXT_MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  wav: 'audio/wav',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Robustly resolve an attachment's kind AND a concrete Content-Type, defending
 * against Android System WebView file pickers that return a File with an empty
 * or missing `type` (common with content:// providers and camera captures).
 *
 * Without this, an empty-MIME image classifies as a generic 'file': no compose
 * thumbnail, it uploads as application/octet-stream, and it renders as a
 * download link instead of a tappable image that opens in the lightbox.
 *
 * The team already hardened the *voice-note* path against the same empty-MIME
 * quirk; this is the equivalent guard for picked files/photos.
 */
export function resolveFileType(
  file: File,
  opts?: { assumeImage?: boolean },
): { kind: AttachmentKind; contentType: string } {
  const rawType = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  // 1. Trust an explicit MIME when the browser provides one.
  if (rawType) return { kind: attachmentKindFor(rawType), contentType: rawType };

  // 2. Empty MIME — recover it from the filename extension.
  const ext = extensionOf(file.name);
  if (IMAGE_EXT_MIME[ext]) return { kind: 'image', contentType: IMAGE_EXT_MIME[ext] };
  if (AUDIO_EXT_MIME[ext]) return { kind: 'audio', contentType: AUDIO_EXT_MIME[ext] };

  // 3. Still unknown — the camera capture path knows it produced an image.
  if (opts?.assumeImage) return { kind: 'image', contentType: 'image/jpeg' };

  return { kind: 'file', contentType: 'application/octet-stream' };
}

export async function uploadAttachment(
  item: OutgoingAttachment,
  conversationId: string,
): Promise<Attachment> {
  const { file, durationMs } = item;
  // Prefer the MIME resolved at pick time (recovers empty Android-WebView types);
  // fall back to the live File.type, then a generic binary type.
  const contentType = item.contentType || file.type || 'application/octet-stream';
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
