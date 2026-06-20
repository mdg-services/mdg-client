import { z } from 'zod';

import { DEVICE_PLATFORMS } from '../types/enums';

export const registerDeviceSchema = z.object({
  token: z.string().trim().min(1).max(512),
  platform: z.enum(DEVICE_PLATFORMS),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z.object({
  token: z.string().trim().min(1).max(512),
});
export type UnregisterDeviceInput = z.infer<typeof unregisterDeviceSchema>;
