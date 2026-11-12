import { z } from 'zod';

import { DEVICE_PLATFORMS } from '../types/enums';

export const registerDeviceSchema = z.object({
  token: z.string().trim().min(1).max(512),
  platform: z.enum(DEVICE_PLATFORMS),
  /**
   * The Android notification channel the phone's app made for chat messages, the
   * pop-up one (ADR 0040 §3). Sent only by an app that has made it; a push names
   * it only for phones that sent it.
   */
  channelId: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{1,64}$/)
    .optional(),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z.object({
  token: z.string().trim().min(1).max(512),
});
export type UnregisterDeviceInput = z.infer<typeof unregisterDeviceSchema>;

/**
 * Where notifications stand on the phone the dealer app is running on (ADR 0040
 * §4), reported by the app when it starts and whenever the answer changes. Feeds
 * the team's "can we reach them?" line.
 */
export const deviceStatusSchema = z.object({
  platform: z.enum(DEVICE_PLATFORMS),
  push: z.enum(['on', 'off', 'ask', 'unavailable']),
  canAskAgain: z.boolean().optional(),
  /** The phone's maker as the phone app reports it ("Xiaomi"); read off the browser signature when absent. */
  maker: z.string().trim().max(40).optional(),
});
export type DeviceStatusInput = z.infer<typeof deviceStatusSchema>;
