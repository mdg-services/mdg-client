import type { Attachment, PresignUploadResponse } from '@dk/shared/types';

import { api } from './api';
import { compressImage } from './compressImage';

/**
 * Upload one Kavach evidence photo.
 *
 * Separate from `uploadAttachment` because evidence for a compliance task is not
 * a chat message. Riding the `chat` scope meant the camera could not open until
 * a conversation id had resolved — so on a slow 2G morning the dealer tapped
 * "send photo" and nothing happened, for a reason that had nothing to do with
 * the photo or the task. The `kavach` scope needs only the dealer's own id,
 * which the app already holds from login.
 *
 * The photo is downscaled before the presign, so the Content-Type we sign is
 * always the one we actually PUT — a mismatch is refused by S3 and reads to the
 * dealer as "your photo was rejected".
 */
export async function uploadKavachProof(
  file: File,
  dealerId: string,
  contentType: string,
): Promise<Attachment> {
  let upload = file;
  let type = contentType || file.type || 'image/jpeg';

  const compressed = await compressImage(upload, { contentType: type });
  if (compressed) {
    upload = compressed;
    type = compressed.type || type;
  }

  // An Android System WebView camera capture can hand back a File with no name.
  const filename = upload.name || 'kavach-proof.jpg';

  const presign = await api.post<PresignUploadResponse>('/v1/uploads/sign', {
    filename,
    contentType: type,
    size: upload.size,
    scope: 'kavach',
    dealerId,
  });

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body: upload,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  return {
    storageKey: presign.storageKey,
    filename,
    contentType: type,
    size: upload.size,
    kind: 'image',
  };
}
