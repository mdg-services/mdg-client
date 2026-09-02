import type { Attachment } from '@dk/shared/types';

import { preparePhoto, presignAndPut } from './uploadCommon';

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
 * `contentType` is the type the CARD already resolved at pick time and refused a
 * non-image on; it is passed through so the bytes are signed as the thing that
 * was judged. The downscale happens before the presign, so the Content-Type we
 * sign is always the one we actually PUT — a mismatch is refused by S3 and reads
 * to the dealer as "your photo was rejected".
 */
export async function uploadKavachProof(
  file: File,
  dealerId: string,
  contentType: string,
): Promise<Attachment> {
  const photo = await preparePhoto(file, 'kavach-proof.jpg', { contentType });
  const storageKey = await presignAndPut(photo, { scope: 'kavach', dealerId });
  return {
    storageKey,
    filename: photo.filename,
    contentType: photo.contentType,
    size: photo.size,
    kind: 'image',
  };
}
