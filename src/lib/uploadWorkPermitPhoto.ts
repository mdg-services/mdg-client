import { resolveFileType } from './uploadAttachment';
import { preparePhoto, presignAndPut, type PreparedPhoto } from './uploadCommon';
import { PhotoRejected } from './uploadMockDrillPhoto';

/**
 * Prepare and upload one photo for the work-permit box (ADR 0053): the letterhead,
 * a signed and stamped page. Images only, 10 MB at most, judged on the shrunk
 * file. Same presign-then-PUT road as every direct upload, scope `work-permit`.
 */
export const WORK_PERMIT_PHOTO_LIMIT_BYTES = 10 * 1024 * 1024;

const PHOTO_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_TYPES: ReadonlySet<string> = new Set(['image/heic', 'image/heif']);

function photoContentType(file: File): string {
  const raw = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw) return raw;
  return resolveFileType(file).contentType;
}

export async function prepareWorkPermitPhoto(file: File): Promise<PreparedPhoto> {
  const type = photoContentType(file);
  if (!PHOTO_TYPES.has(type) && !HEIC_TYPES.has(type)) throw new PhotoRejected('type');
  const photo = await preparePhoto(file, 'photo.jpg', { contentType: type });
  if (!PHOTO_TYPES.has(photo.contentType)) throw new PhotoRejected('type');
  if (photo.size > WORK_PERMIT_PHOTO_LIMIT_BYTES) throw new PhotoRejected('size');
  return photo;
}

export async function uploadWorkPermitPhoto(
  file: File,
  dealerId: string,
): Promise<{ key: string; filename: string }> {
  const photo = await prepareWorkPermitPhoto(file);
  const key = await presignAndPut(photo, { scope: 'work-permit', dealerId });
  return { key, filename: photo.filename.slice(0, 255) };
}
