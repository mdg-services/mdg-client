import type { TtRegisterPhotoInput } from '@dk/shared/schemas';

import { preparePhoto, presignAndPut } from './uploadCommon';

/**
 * Send one photograph of the density-register page to the bucket, and describe
 * what was sent.
 *
 * This one photo is the dealer's entire job in this service, and it is taken on
 * a cheap Android phone, at a pump, on a link that is often 2G. Both of the
 * things that go wrong there — an Android WebView camera capture with an empty
 * MIME and an empty name, and a 3–6 MB raw JPEG on a 2G link — are handled in
 * `preparePhoto`; see `uploadCommon.ts` for what each one costs the dealer.
 *
 * This file used to say it was `uploadStaffHardcopy` copied on purpose, because
 * "the two uploads presign against two different server-side access rules, and
 * one shared helper is how those rules end up one careless refactor apart."
 * The rules are still separate and still enforced on the server; what the two
 * shared was never a rule, it was the byte-shovelling. `UploadTarget` keeps the
 * scope AND the fields that scope requires here at the call site, so
 * `tt-density` cannot be sent without this dealer's id and cannot be widened
 * into anybody else's scope by a change made elsewhere.
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
  const photo = await preparePhoto(file, 'register.jpg');
  const storageKey = await presignAndPut(photo, { scope: 'tt-density', dealerId });
  return {
    storageKey,
    filename: photo.filename,
    contentType: photo.contentType,
    size: photo.size,
  };
}
