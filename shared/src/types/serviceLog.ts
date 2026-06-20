import type { Attachment } from './conversation';

/**
 * A record of a service an admin delivered manually, usually logged at the
 * moment a dealer request (conversation) is resolved. Services are provided by
 * hand today; this is the durable history of what was done for each dealer.
 *
 * `serviceId` is a catalog id from the service registry (`GET /services`), or
 * the literal `'other'` when the service isn't in the catalog — in which case
 * `serviceName` carries the free-text description.
 */
export interface ServiceLog {
  id: string;
  dealerId: string;
  dealerName?: string;
  /** The conversation this was logged against, when resolved from a request. */
  conversationId?: string | null;
  /** The organisation member the work was done for, when known. */
  memberUserId?: string | null;
  memberName?: string;
  serviceId: string;
  serviceName: string;
  notes: string;
  attachments?: Attachment[];
  providedByAdminId: string;
  providedByName?: string;
  providedAt: string;
  createdAt: string;
  updatedAt: string;
}
