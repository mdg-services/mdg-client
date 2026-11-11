import { resolveFileType } from './uploadAttachment';
import { preparePhoto, presignAndPut, type PreparedPhoto } from './uploadCommon';

/**
 * Prepare and upload one photo of a mock drill (ADR 0034).
 *
 * IndianOil's page takes two images, each at most 5 MB, and the server turns away
 * anything else. This is the same presign-then-PUT road every direct upload takes
 * (`uploadCommon.ts`) with scope `mock-drill`; what is added here is only the
 * check of WHAT was picked, so an owner who chose a PDF or a 12 MB photo is told
 * in plain words before anything is sent.
 */

/** The largest photo the portal takes: 5 MB. Same figure as the contract's. */
export const MOCK_DRILL_PHOTO_LIMIT_BYTES = 5 * 1024 * 1024;

const PHOTO_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * An iPhone's own photo format. It is not accepted as it is, but the shared photo
 * preparation converts it to a JPEG when the phone can decode it, so it is let
 * through to that step and judged again on what comes out.
 */
const HEIC_TYPES: ReadonlySet<string> = new Set(['image/heic', 'image/heif']);

/** Why a picked file was turned away before upload. */
export type PhotoRejection = 'type' | 'size';

export class PhotoRejected extends Error {
  readonly reason: PhotoRejection;
  constructor(reason: PhotoRejection) {
    super(`mock drill photo rejected: ${reason}`);
    this.name = 'PhotoRejected';
    this.reason = reason;
  }
}

/**
 * The real type of a picked file. An Android file picker often hands back an
 * empty `type`, so it is recovered from the name.
 */
function photoContentType(file: File): string {
  const raw = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw) return raw;
  return resolveFileType(file).contentType;
}

/**
 * The bytes to send and what to call them. The photo is shrunk first (a camera
 * JPEG is 3 to 6 MB) and judged on the SHRUNK size, which is what the portal gets.
 */
export async function prepareMockDrillPhoto(file: File): Promise<PreparedPhoto> {
  const type = photoContentType(file);
  if (!PHOTO_TYPES.has(type) && !HEIC_TYPES.has(type)) throw new PhotoRejected('type');
  const photo = await preparePhoto(file, 'photo.jpg', { contentType: type });
  // A HEIC the phone could not convert is still HEIC here: the server would refuse it.
  if (!PHOTO_TYPES.has(photo.contentType)) throw new PhotoRejected('type');
  if (photo.size > MOCK_DRILL_PHOTO_LIMIT_BYTES) throw new PhotoRejected('size');
  return photo;
}

/** Presign, PUT, and hand back the key the SERVER issued and the file's name. */
export async function uploadMockDrillPhoto(
  file: File,
  dealerId: string,
): Promise<{ key: string; filename: string }> {
  const photo = await prepareMockDrillPhoto(file);
  const key = await presignAndPut(photo, { scope: 'mock-drill', dealerId });
  // The answer's filename is 255 characters at most.
  return { key, filename: photo.filename.slice(0, 255) };
}
