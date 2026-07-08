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

/**
 * Super-admin edit of ANY user (admin or dealer member): change the login email,
 * reset the password, suspend/reactivate, switch a dealer member's role, or
 * grant/revoke the super-admin tier. At least one field must be provided. Backs
 * the centralized "All users" console, which is super-admin only.
 */
export const superAdminUpdateUserSchema = z
  .object({
    email: z.string().email().toLowerCase().optional(),
    password: z.string().min(8, 'At least 8 characters').max(200).optional(),
    /** Suspend (block login) or reactivate any user. */
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    /**
     * Switch a dealer member between owner and manager. Cross-boundary changes
     * (admin ⇄ dealer) are rejected by the API — role is only meaningful within a
     * dealer here, and one active manager per dealer is enforced.
     */
    role: z.enum(['dealer-owner', 'dealer-staff']).optional(),
    /** Grant or revoke the elevated admin tier (platform admins only). */
    isSuperAdmin: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update',
  });
export type SuperAdminUpdateUserInput = z.infer<typeof superAdminUpdateUserSchema>;
