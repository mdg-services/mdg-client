import { WASHROOM_PHOTO_MAX_BYTES, type WashroomPhotoSlot } from '@dk/shared/types';

import { ImageRejected, squeezeImage } from './squeezeImage';
import { resolveFileType } from './uploadAttachment';
import { presignAndPut, type PreparedPhoto } from './uploadCommon';

/**
 * Prepare and upload one washroom photo of a dealer declaration (ADR 0037).
 *
 * IndianOil's page takes at most 500 KB per photo, so every photo is squeezed on the
 * phone first (`squeezeImage`: a JPEG of about 400 KB) and the server turns away
 * anything bigger than 500 KB. This is the same presign-then-PUT road every direct
 * upload takes (`uploadCommon.ts`) with scope `declarations`; what is added here is
 * the check of WHAT was picked, so an owner who chose a PDF is told in plain words
 * before anything is sent.
 */

/** The real type of a picked file. An Android picker often hands back an empty `type`. */
function pickedType(file: File): string {
  const raw = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw) return raw;
  // An empty type from a camera capture is still a picture: the squeezer opens it,
  // and refuses it in plain words if it turns out not to be one.
  return resolveFileType(file, { assumeImage: true }).contentType;
}

/**
 * The bytes to send and what to call them. The name says which photo it is, so an
 * admin looking at the files sees "washroom-outside.jpg", not a camera's number.
 */
export async function prepareDeclarationsPhoto(
  file: File,
  slot: WashroomPhotoSlot,
): Promise<PreparedPhoto> {
  if (!pickedType(file).startsWith('image/')) throw new ImageRejected('type');
  const squeezed = await squeezeImage(file);
  // The squeezer never returns more than the cap; this is the last look before the wire.
  if (squeezed.size > WASHROOM_PHOTO_MAX_BYTES) throw new ImageRejected('size');
  return {
    file: squeezed,
    filename: `washroom-${slot}.jpg`,
    contentType: 'image/jpeg',
    size: squeezed.size,
  };
}

/** Squeeze, presign, PUT, and hand back the key the SERVER issued and the file's name. */
export async function uploadDeclarationsPhoto(
  file: File,
  dealerId: string,
  slot: WashroomPhotoSlot,
): Promise<{ key: string; filename: string }> {
  const photo = await prepareDeclarationsPhoto(file, slot);
  const key = await presignAndPut(photo, { scope: 'declarations', dealerId });
  return { key, filename: photo.filename };
}
