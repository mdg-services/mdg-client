import type { DevicePlatform } from './enums';

/**
 * A registered push-notification target for a user. One user may have several
 * devices (phone, tablet, web). The Expo push token is the unique key.
 */
export interface Device {
  id: string;
  userId: string;
  token: string;
  platform: DevicePlatform;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}
