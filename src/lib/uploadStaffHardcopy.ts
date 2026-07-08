import type { PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';
import { compressImage } from './compressImage';
import { resolveFileType } from './uploadAttachment';

/**
 * Prepare and upload the mandatory hardcopy photo for a staff-points finalize.
 *
 * Mirrors the chat attachment path: recover a concrete Content-Type even when an
 * Android WebView camera capture hands back an empty MIME, downscale + recompress
 * so a multi-megabyte camera JPEG uploads as a few hundred KB over 2G, presign
 * with `scope:'staff'` + `dealerId` (the server keys it under `staff/<dealerId>/…`),
 * PUT the bytes, and return the `storageKey` to pass as `hardCopyImageKey`.
 */
export async function uploadStaffHardcopy(
  file: File,
  dealerId: string,
): Promise<string> {
  // Camera captures often arrive with an empty type — recover it.
  const resolved = resolveFileType(file, { assumeImage: true });
  let upload = file;
  let contentType = resolved.contentType;

  const compressed = await compressImage(file, { contentType });
  if (compressed) {
    upload = compressed;
    contentType = compressed.type || contentType;
  }

  const presign = await api.post<PresignUploadResponse>('/v1/uploads/sign', {
    // Android camera captures sometimes hand back an empty File.name.
    filename: upload.name || 'hardcopy.jpg',
    contentType,
    size: upload.size,
    scope: 'staff',
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

  return presign.storageKey;
}
