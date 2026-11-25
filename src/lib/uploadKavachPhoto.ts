import type { Attachment } from '@dk/shared/types';

import { resolveFileType } from './uploadAttachment';
import { preparePhoto, presignAndPut } from './uploadCommon';

/**
 * Prepare and upload one file for a Kavach point (ADR 0057): a photo, or a PDF where the point
 * takes one. Same presign-then-PUT road as every direct upload, scope `kavach`. A photo is
 * shrunk first (a few hundred KB instead of a camera's 5 MB); a PDF goes as it is.
 *
 * Returns the `Attachment` the submit call carries, built from the key the SERVER issued.
 */
export async function uploadKavachFile(
  file: File,
  dealerId: string,
  opts: { assumeImage?: boolean } = {},
): Promise<Attachment> {
  const { kind, contentType } = resolveFileType(file, { assumeImage: opts.assumeImage ?? true });
  if (kind === 'image') {
    const photo = await preparePhoto(file, 'photo.jpg', { contentType });
    const storageKey = await presignAndPut(photo, { scope: 'kavach', dealerId });
    return {
      storageKey,
      filename: photo.filename.slice(0, 255),
      contentType: photo.contentType,
      size: photo.size,
      kind: 'image',
    };
  }
  const storageKey = await presignAndPut(
    { file, filename: file.name || 'file.pdf', contentType, size: file.size },
    { scope: 'kavach', dealerId },
  );
  return { storageKey, filename: (file.name || 'file.pdf').slice(0, 255), contentType, size: file.size, kind };
}
