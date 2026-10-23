import type { SetupServiceId } from '@dk/shared/types';

/**
 * The short video that explains each service, played from the ▶ beside it on the
 * services card.
 *
 * EMPTY ON PURPOSE FOR NOW. The six service videos are not made yet (plan §7:
 * one per service, 40–60 seconds). The card has the slot: a service with an entry
 * here gets a ▶ button, a service without one shows no button at all — never a
 * dead one. When a video is uploaded, adding it is one line here: the service's
 * id and the address the video plays from.
 */
export const SERVICE_VIDEO: Readonly<Partial<Record<SetupServiceId, string>>> = {};
