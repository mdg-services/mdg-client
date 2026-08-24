import type { TtRegisterPhotoInput } from '@dk/shared/schemas';
import type { PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';
import { compressImage } from './compressImage';
import { resolveFileType } from './uploadAttachment';

/**
 * Send one photograph of the density-register page to the bucket, and describe
 * what was sent.
 *
 * This one photo is the dealer's entire job in this service, and it is taken on
 * a cheap Android phone, at a pump, on a link that is often 2G. Two things go
 * wrong there and both are dealt with before a byte leaves the phone:
 *
 *  - A camera capture routed through the Android System WebView hands back a
 *    `File` whose `type` is the empty string. Left alone it presigns as
 *    `application/octet-stream`, and the server refuses it — the register page
 *    must be an image — so the dealer is told their photo is not a photo.
 *    `resolveFileType(file, { assumeImage: true })` recovers the real type.
 *  - A raw camera JPEG is 3–6 MB. `compressImage` (1600 px longest edge, JPEG
 *    q0.70, skipped under ~300 KB) turns that into a few hundred KB, which is
 *    the difference between a ten-second send and a minute the dealer abandons.
 *
 * It is `uploadStaffHardcopy` with a different scope, copied rather than
 * generalised on purpose: the two uploads presign against two different
 * server-side access rules, and one shared helper is how those rules end up one
 * careless refactor apart.
 *
 * It returns the whole photo record and not just the key, because marking a day
 * needs `{ storageKey, filename, contentType, size }` — all four measured on the
 * file that was actually PUT, so what the server records is what is in the
 * bucket rather than what came off the camera.
 */
export async function uploadDensityPhoto(
  file: File,
  dealerId: string,
): Promise<TtRegisterPhotoInput> {
  const resolved = resolveFileType(file, { assumeImage: true });
  let upload = file;
  let contentType = resolved.contentType;

  const compressed = await compressImage(file, { contentType });
  if (compressed) {
    upload = compressed;
    contentType = compressed.type || contentType;
  }

  // Android camera captures sometimes hand back an empty File.name, and the
  // presign requires one.
  const filename = upload.name || 'register.jpg';

  const presign = await api.post<PresignUploadResponse>('/v1/uploads/sign', {
    filename,
    contentType,
    size: upload.size,
    scope: 'tt-density',
    dealerId,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: upload,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  return {
    storageKey: presign.storageKey,
    filename,
    contentType,
    size: upload.size,
  };
}
