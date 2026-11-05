import { resolveFileType } from './uploadAttachment';
import { preparePhoto, presignAndPut, type PreparedPhoto } from './uploadCommon';

/**
 * Prepare and upload one paper for a DU OTP acknowledgement: the calibration
 * certificate, the DU service report, or an "other" document.
 *
 * The server accepts a PDF, or a JPEG / PNG / WebP photo (which it turns into a
 * PDF), up to 10 MB. This is the same presign-then-PUT road every direct upload
 * takes (`uploadCommon.ts`) with scope `du-otp`; what is added here is only the
 * check of WHAT was picked, so an owner who chose a Word file or a 40 MB scan is
 * told in plain words before anything is sent, not by a refused request.
 */

/** The largest paper the server takes. */
export const DU_OTP_PAPER_MAX_BYTES = 10 * 1024 * 1024;

const PHOTO_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * An iPhone's own photo format. It is not accepted as it is, but the shared photo
 * preparation converts it to a JPEG when the phone can decode it, so it is let
 * through to that step and judged again on what comes out.
 */
const HEIC_TYPES: ReadonlySet<string> = new Set(['image/heic', 'image/heif']);

/** Why a picked file was turned away before upload. */
export type PaperRejection = 'type' | 'size';

export class PaperRejected extends Error {
  readonly reason: PaperRejection;
  constructor(reason: PaperRejection) {
    super(`paper rejected: ${reason}`);
    this.name = 'PaperRejected';
    this.reason = reason;
  }
}

/**
 * The real type of a picked file. An Android file picker often hands back an
 * empty `type`, so it is recovered from the name (`.pdf`, or a photo extension).
 */
export function paperContentType(file: File): string {
  const raw = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw) return raw;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  return resolveFileType(file).contentType;
}

/**
 * The bytes to send and what to call them. A PDF goes as it is; a photo is shrunk
 * first (a camera JPEG is 3 to 6 MB) and judged on the SHRUNK size.
 */
export async function prepareDuOtpPaper(file: File): Promise<PreparedPhoto> {
  const type = paperContentType(file);

  if (type === 'application/pdf') {
    if (file.size > DU_OTP_PAPER_MAX_BYTES) throw new PaperRejected('size');
    return {
      file,
      filename: file.name || 'document.pdf',
      contentType: type,
      size: file.size,
    };
  }

  if (!PHOTO_TYPES.has(type) && !HEIC_TYPES.has(type)) throw new PaperRejected('type');
  const photo = await preparePhoto(file, 'photo.jpg', { contentType: type });
  // A HEIC the phone could not convert is still HEIC here: the server would refuse it.
  if (!PHOTO_TYPES.has(photo.contentType)) throw new PaperRejected('type');
  if (photo.size > DU_OTP_PAPER_MAX_BYTES) throw new PaperRejected('size');
  return photo;
}

/**
 * Presign, PUT, and hand back what the answer needs: the key the SERVER issued
 * and the file's name. A refused PUT throws (see `presignAndPut`).
 */
export async function uploadDuOtpPaper(
  file: File,
  dealerId: string,
): Promise<{ key: string; filename: string }> {
  const paper = await prepareDuOtpPaper(file);
  const key = await presignAndPut(paper, { scope: 'du-otp', dealerId });
  // The answer's filename is 255 characters at most.
  return { key, filename: paper.filename.slice(0, 255) };
}
