import { preparePhoto, presignAndPut } from './uploadCommon';

/**
 * Prepare and upload the mandatory hardcopy photo for a staff-points finalize.
 *
 * Presigns with `scope: 'staff'` + this dealer's id, which is what keys the
 * object under `staff/<dealerId>/…`, and returns the `storageKey` to pass as
 * `hardCopyImageKey`. The empty-MIME and multi-megabyte-JPEG defences live in
 * `preparePhoto` — see `uploadCommon.ts`.
 */
export async function uploadStaffHardcopy(
  file: File,
  dealerId: string,
): Promise<string> {
  const photo = await preparePhoto(file, 'hardcopy.jpg');
  return presignAndPut(photo, { scope: 'staff', dealerId });
}
