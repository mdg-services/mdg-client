import type { PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';
import { compressImage } from './compressImage';
import { resolveFileType } from './uploadAttachment';

/**
 * The mechanics a direct photo upload shares, in one place.
 *
 * It began as the one copy of four near-identical uploaders (the Staff Points
 * hardcopy, the density register page, Kavach evidence, a document ask), so a fix
 * to "recover the MIME an Android camera did not set, shrink the picture,
 * presign, PUT, describe what landed" would not have to be remembered four
 * times. Three of those left the app when MDG's requests moved into the chat —
 * a photo sent there goes through `uploadAttachment` like any other message —
 * and the staff hardcopy is the one caller left.
 *
 * The split is still deliberate and narrow:
 *
 *   - THE SCOPE STAYS AT THE CALL SITE. {@link UploadTarget} is a discriminated
 *     union, so the compiler enforces what each scope needs, and nothing here can
 *     quietly widen one scope's access rules into another's. The server's
 *     per-scope key builder and its per-prefix download fence are untouched; this
 *     file never chooses a scope, it only carries the one it was handed.
 *   - ONLY THE BYTE-SHOVELLING IS SHARED. Preparing a photograph and PUTting it
 *     at a presigned URL is the same job whoever asked for it.
 *
 * `uploadAttachment` (the chat path) is deliberately NOT built on this: it
 * carries voice notes, keeps a locally-staged preview with waveform peaks, and
 * decides `kind` for three media types rather than assuming a photograph. It is
 * also the busiest path in the app. Folding it in would have meant widening this
 * helper until it was a shape with an `if` for every caller, which is the thing
 * the duplication was at least honest about.
 */

/** Where a presigned upload is filed, and what each scope needs to be filed there. */
export type UploadTarget =
  /** A Staff Points hardcopy photograph. Keyed under `staff/<dealerId>/`. */
  { scope: 'staff'; dealerId: string };

/**
 * A photograph, ready to go: the bytes that will actually be PUT, and the three
 * facts the server records about them.
 *
 * `size` and `contentType` describe the PREPARED file, never the one that came
 * off the camera. Recording the camera's 6 MB against a 200 KB object is how a
 * stored record stops matching the object it points at.
 */
export interface PreparedPhoto {
  /** The bytes to PUT. The compressed file when compression was worth it. */
  file: File;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * Get a picked or captured photograph ready to send.
 *
 * Two things go wrong on a cheap Android phone at a pump, and both are dealt
 * with here rather than at each call site:
 *
 *  - A camera capture routed through the Android System WebView hands back a
 *    `File` whose `type` — and often whose `name` — is the empty string. Left
 *    alone it presigns as `application/octet-stream`, the server refuses it
 *    because the paper must be an image, and the dealer is told their photo is
 *    not a photo. `resolveFileType(file, { assumeImage: true })` recovers the
 *    real type; `fallbackName` covers the empty name.
 *  - A raw camera JPEG is 3–6 MB. `compressImage` (1600 px longest edge, JPEG
 *    q0.70, skipped under ~300 KB) turns that into a few hundred KB, which is
 *    the difference between a ten-second send and a minute the dealer abandons.
 *
 * `compressImage` returns `null` whenever shrinking is not worth it or could go
 * wrong, and the original file is then kept — so the Content-Type that is
 * signed is always the Content-Type that is PUT. A mismatch is refused by the
 * bucket and reads to the dealer as "your photo was rejected".
 *
 * `opts.contentType` is for a caller that has ALREADY resolved the type at pick
 * time and judged the file on it — a caller that refuses a non-image before it
 * ever gets here. Passing the type it judged means the bytes are signed as the
 * thing that was checked, rather than as whatever a second resolve happens to
 * decide. Omit it and this resolves the type itself.
 */
export async function preparePhoto(
  file: File,
  fallbackName: string,
  opts?: { contentType?: string },
): Promise<PreparedPhoto> {
  const resolved = resolveFileType(file, { assumeImage: true });
  let upload = file;
  let contentType = opts?.contentType || resolved.contentType;

  const compressed = await compressImage(file, { contentType });
  if (compressed) {
    upload = compressed;
    contentType = compressed.type || contentType;
  }

  return {
    file: upload,
    filename: upload.name || fallbackName,
    contentType,
    size: upload.size,
  };
}

/**
 * Presign, then PUT, and hand back the key the SERVER issued.
 *
 * The key is never composed on this side. The server's per-scope key builder is
 * what the download fence in `uploads.ts` checks against, and a client that
 * guessed at the shape would be guessing at an access boundary.
 *
 * A refused PUT THROWS. Resolving with a key for bytes that never landed is the
 * worst outcome available here: the ask would be marked sent against an object
 * that is not in the bucket, an admin would open a broken image, and the dealer
 * would have been told their paper was with MDG.
 */
export async function presignAndPut(
  photo: PreparedPhoto,
  target: UploadTarget,
): Promise<string> {
  const presign = await api.post<PresignUploadResponse>('/v1/uploads/sign', {
    filename: photo.filename,
    contentType: photo.contentType,
    size: photo.size,
    ...target,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': photo.contentType },
    body: photo.file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  return presign.storageKey;
}
