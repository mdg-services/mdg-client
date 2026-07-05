import { z } from 'zod';

/**
 * Create a new admin (support/operations user). Admins are stored in the User
 * collection with role `admin`; unlike dealer members they have no dealerId.
 */
export const createAdminSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().trim().min(2, 'Name is required').max(120),
  password: z.string().min(8, 'At least 8 characters').max(200),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

/** Update an existing admin: rename, suspend/reactivate, or reset the password. */
export const updateAdminSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
