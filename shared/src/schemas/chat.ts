import { z } from 'zod';

import { CHAT_ASK_REF_PATTERN } from '../types/chatAsk';
import { QUICK_REACTIONS } from '../types/conversation';
import { SHARE_AUDIENCES } from '../types/share';

/** Hard cap on a single voice note: 10 minutes. */
export const MAX_VOICE_DURATION_MS = 10 * 60 * 1000;

/** Max chars of the original body snapshotted into a reply quote. */
export const REPLY_SNIPPET_MAX = 140;

/**
 * Build the reply-quote snippet from the original body. Slices by code point
 * (not UTF-16 unit) so a cut at the limit can never split an emoji's surrogate
 * pair into a corrupted "�" tail. Used by the server snapshot and by both web
 * clients' optimistic mirrors — keep them byte-identical.
 */
export function replySnippet(body: string): string {
  return Array.from(body).slice(0, REPLY_SNIPPET_MAX).join('');
}

export const attachmentSchema = z.object({
  storageKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(25 * 1024 * 1024),
  kind: z.enum(['image', 'file', 'audio']),
  /** Voice-note length in ms; only meaningful when kind === 'audio'. */
  durationMs: z.number().int().nonnegative().max(MAX_VOICE_DURATION_MS).optional(),
});
export type AttachmentInput = z.infer<typeof attachmentSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(4000).optional(),
    attachments: z.array(attachmentSchema).max(10).optional().default([]),
    /** Id of the message this one replies to; must belong to the same conversation. */
    replyToMessageId: z.string().min(1).max(64).optional(),
    /**
     * The request this message answers (`doc:…`, `reg:…`, `kv:…`, ADR 0019) —
     * set when the dealer pressed "Send photo" on an ask. The server also
     * derives it from `replyToMessageId` when the quoted message is an ask.
     */
    answersAsk: z.string().regex(CHAT_ASK_REF_PATTERN).optional(),
  })
  .refine((d) => (d.body && d.body.length > 0) || (d.attachments && d.attachments.length > 0), {
    message: 'Message must have a body or at least one attachment',
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * An admin's message sent to the OUTLET rather than to the one chat they are
 * in: every owner's own chat, the manager group, or both — the same three
 * choices every report's Share button offers.
 *
 * It is what the Reports shelf used to do for a file an admin uploaded: the
 * shelf showed it to every member of the outlet, a chat shows it to the people
 * in that chat. Voice notes stay out: a voice note is a reply in a
 * conversation, not a paper for the whole outlet.
 */
export const shareChatMessageSchema = z
  .object({
    body: z.string().trim().max(4000).optional(),
    attachments: z
      .array(attachmentSchema.refine((a) => a.kind !== 'audio', 'Voice notes go to this chat only'))
      .max(10)
      .optional()
      .default([]),
    audience: z.enum(SHARE_AUDIENCES),
  })
  .refine((d) => (d.body && d.body.length > 0) || (d.attachments && d.attachments.length > 0), {
    message: 'Message must have a body or at least one attachment',
  });
export type ShareChatMessageInput = z.infer<typeof shareChatMessageSchema>;

/**
 * An admin marks a dealer's chat photo (or PDF) as received for one of the
 * outlet's open requests (ADR 0019). `attachmentIndex` picks the file when the
 * message carries several; `validUntil` is the date printed on a paper whose
 * kind tracks expiry — required for those, ignored otherwise.
 */
export const receiveChatAttachmentSchema = z.object({
  ref: z.string().regex(CHAT_ASK_REF_PATTERN),
  attachmentIndex: z.number().int().min(0).max(9).optional().default(0),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ReceiveChatAttachmentInput = z.infer<typeof receiveChatAttachmentSchema>;

/** An admin sends a dealer's answer back, with a reason the dealer reads verbatim. */
export const sendBackChatAttachmentSchema = z.object({
  ref: z.string().regex(CHAT_ASK_REF_PATTERN),
  reason: z.string().trim().min(4).max(500),
});
export type SendBackChatAttachmentInput = z.infer<typeof sendBackChatAttachmentSchema>;

/** The dealer's app asks where a handful of requests stand (`GET /asks/me/states?refs=`). */
export const chatAskStatesQuerySchema = z.object({
  refs: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.string().regex(CHAT_ASK_REF_PATTERN)).min(1).max(50)),
});

/** Set (or replace) the caller's reaction on a message. */
export const reactToMessageSchema = z.object({
  emoji: z.enum(QUICK_REACTIONS),
});
export type ReactToMessageInput = z.infer<typeof reactToMessageSchema>;

/** Query params for the per-conversation media/docs/links gallery. */
export const conversationMediaQuerySchema = z.object({
  tab: z.enum(['media', 'docs', 'links']).default('media'),
  /** ISO createdAt cursor: return items strictly older than this. */
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
export type ConversationMediaQuery = z.infer<typeof conversationMediaQuerySchema>;

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  scope: z.enum(['chat', 'avatar', 'staff', 'tt-density', 'kavach', 'slip', 'ask']).default('chat'),
  conversationId: z.string().optional(),
  /**
   * Required for the `staff`, `tt-density`, `kavach`, `slip` and `ask` scopes:
   * the dealer the photo belongs to.
   */
  dealerId: z.string().optional(),
  /**
   * Required for the `ask` scope: the DocumentAsk this paper answers.
   *
   * An ask's object is filed under `ask/<dealerId>/<askId>/`, so the row has to
   * exist before there is anywhere to put the file. That is why a dealer
   * volunteering a document creates the ask first and uploads second —
   * `volunteerDocumentAskSchema` deliberately carries no attachment.
   */
  askId: z.string().optional(),
});
/**
 * This union is the ONLY declaration of the upload scopes. `/uploads/sign`
 * validates against it and must derive its handler's body type from
 * `PresignUploadInput` rather than re-spelling the list: a route that keeps its
 * own copy type-checks against scopes the validator rejects, and the mismatch
 * surfaces only as a 400 at the moment a user tries to attach a photo.
 *
 * And a scope added here is only half the job. The route's scope switch ends in
 * a CATCH-ALL `else`, not an `avatar` branch, so a scope named here with no
 * branch of its own is not rejected — it is silently written under `avatars/`,
 * which is the one prefix the download route will sign for any signed-in
 * account with no ownership check at all. A dealer's forecourt slip filed there
 * would be readable by staff at a different outlet. Add the enum member, the key
 * builder and the route branch — ahead of that `else` — in one change, or add
 * none of them.
 */
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const assignConversationSchema = z.object({
  adminId: z.string().optional(),
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;

/**
 * Admin-initiated conversation start. Lets an admin open (or reuse) the private
 * thread of a dealer member who has never messaged first, so support can reach
 * out proactively. Idempotent on the server: one thread per member.
 */
export const startConversationSchema = z.object({
  userId: z.string().min(1),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

export const updateTicketSchema = z.object({
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z
    .enum(['general', 'sales', 'compliance', 'billing', 'technical', 'onboarding'])
    .optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createDealerUserSchema = z.object({
  dealerId: z.string().min(1),
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(120),
  role: z.enum(['dealer-owner', 'dealer-staff']),
  /** Display label for the member, e.g. "Owner" or "Manager". */
  title: z.string().trim().min(1).max(60).optional(),
  password: z.string().min(8).max(200),
  phone: z.string().max(40).optional(),
});
export type CreateDealerUserInput = z.infer<typeof createDealerUserSchema>;

export const updateDealerUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(60).optional(),
    phone: z.string().max(40).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateDealerUserInput = z.infer<typeof updateDealerUserSchema>;
