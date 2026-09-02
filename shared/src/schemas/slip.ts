import { z } from 'zod';

/**
 * The wire shape of "read this slip".
 *
 * One route takes it — the admin-only read on a hand-typed day — and it carries
 * a photograph that has already been uploaded, never the photograph itself.
 *
 * The three mime types are enumerated rather than accepted as `image/*` on
 * purpose. A browser canvas cannot decode HEIC, so a HEIC photograph could
 * neither be shrunk before it was sent nor shown back to the operator on the
 * screen where they are supposed to check it against the paper — and a
 * verification screen with no evidence on it is worse than no screen. Refusing
 * it here, in the one declaration both the route and the client read, is the
 * only place the refusal cannot drift.
 *
 * `size` is what the client says it uploaded, and it is a claim, not a fact: a
 * presigned PUT carries no length limit of its own, so a client that declares
 * one megabyte can upload two hundred. The server measures the stored object
 * before it reads it. This cap exists to refuse the obvious cheaply, one round
 * trip earlier.
 */
export const SLIP_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Four megabytes. Past this a photograph is not sharper, only slower and dearer. */
export const SLIP_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export const readSlipSchema = z.object({
  /** The key returned by `POST /uploads/sign` with `scope: 'slip'`. */
  storageKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.enum(SLIP_PHOTO_MIME_TYPES),
  size: z.number().int().positive().max(SLIP_PHOTO_MAX_BYTES),
});
export type ReadSlipInput = z.infer<typeof readSlipSchema>;
