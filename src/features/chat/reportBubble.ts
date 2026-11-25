import type { MessageKey } from '@/lib/i18n';
import { cleanLegacyCaption, isInteractiveMessage, reportDataOf, reportOf } from '@dk/shared';
import {
  isVideoAttachment,
  type Attachment,
  type Message,
  type ReportKind,
  type TodayReport,
} from '@dk/shared/types';

/**
 * Report messages in the chat (ADR 0055 §3, ADR 0056 §5).
 *
 * A card MDG sends for the dealer to READ (a DSR, a credit position, a tanker's density) is
 * not a picture in the thread. In the chat the same message is a plain text bubble: the team's
 * sentence and ONE button that names the report ("See sales report", with a chevron), in the report's own
 * colour and icon. The button opens the report in the overlay (`/report/:cid/:mid`, or inside
 * the thread in the extension's panel), which draws it from the snapshot on the message. So the
 * thread reads like the team wrote to the dealer, and a report that looks the same on a good day
 * and a bad day is no longer scattered through the conversation as a picture.
 *
 * What counts as a report is `reportOf` in shared, the same function the server's feed uses: a
 * tagged message, or an older one recognised from its caption. Boxes the dealer answers or fills
 * (an ask, a login form, the setup card, a sign-letter) are never reports and draw exactly as
 * they always have, attachments included.
 *
 * Everything that lists a message's pictures asks this module, so a report card cannot turn up
 * in the viewer's swipe, in Download, or as a thumbnail in a reply quote. An OLD message that has
 * only a picture is still a report bubble: its button opens the overlay, which shows the picture.
 *
 * THE EXTENSION'S SIDE PANEL IS THE SAME BUBBLE. It has no Today and no tab bar, so its button
 * opens the overlay as a modal inside the thread instead of a route (`ReportModal`).
 */

// Messages are replaced, never edited, in the query cache, so the answer for a
// message object never goes stale — and a long thread asks about the same
// messages again on every render of the list, the viewer and the selection bar.
const verdicts = new WeakMap<object, boolean>();

/** Is this message drawn as words with a button to Today, and no picture? */
export function isReportBubble(message: Message): boolean {
  const known = verdicts.get(message);
  if (known !== undefined) return known;
  const verdict =
    // One still being sent is the dealer's own and the server has not seen it.
    !message.id.startsWith('temp-') && !isInteractiveMessage(message) && reportOf(message) !== null;
  verdicts.set(message, verdict);
  return verdict;
}

/**
 * A voice note or a video on a report message is not the card: it is something MDG
 * said or showed, and it stays where it is.
 */
function isCardAttachment(a: Attachment): boolean {
  return a.kind !== 'audio' && !isVideoAttachment(a);
}

/**
 * The attachments the chat draws, lists in the picture viewer, downloads and quotes
 * as a thumbnail: all of them, except the card pictures of a report message.
 */
export function chatAttachments(message: Message): readonly Attachment[] {
  if (message.attachments.length === 0 || !isReportBubble(message)) return message.attachments;
  return message.attachments.filter((a) => !isCardAttachment(a));
}

/**
 * An older card's caption, the way a person on the team would have written it: the leading
 * emoji gone, and a "DSR ·" style heading turned into plain words. The rule is shared with
 * the server (`cleanLegacyCaption`), which cleans the same old captions for Today and for
 * the quote a reply keeps.
 */
export const cleanReportCaption = cleanLegacyCaption;

/**
 * Does this report bubble's caption still wear the old robot style? Only a message with
 * no tag that is not an announcement or a tanker card: a tagged message is already the
 * team's own words, and an announcement is whatever an admin typed.
 */
export function isLegacyReportCaption(message: Message): boolean {
  return !message.report && !message.announcement && !message.fuelCard;
}

/** What a report bubble says when the message carries no words of its own. */
export const REPORT_SENTENCE_KEY = {
  dsr_sales: 'chat.reportSentenceDsrSales',
  dsr_variation: 'chat.reportSentenceDsrVariation',
  credit_dod: 'chat.reportSentenceCreditDod',
  water_ingress: 'chat.reportSentenceWaterIngress',
  ro_supply: 'chat.reportSentenceRoSupply',
  stock_check: 'chat.reportSentenceStockCheck',
  load_plan: 'chat.reportSentenceLoadPlan',
  tanker_density: 'chat.reportSentenceTankerDensity',
  tt_ack: 'chat.reportSentenceTtAck',
  fuel_order: 'chat.reportSentenceFuelOrder',
  declaration_filed: 'chat.reportSentenceDeclarationFiled',
  du_otp: 'chat.reportSentenceDuOtp',
  mock_drill: 'chat.reportSentenceMockDrill',
  ledger_watch: 'chat.reportSentenceLedgerWatch',
  announcement: 'chat.reportSentenceAnnouncement',
  electrical_audit: 'chat.reportSentenceElectricalAudit',
  calibration_claim: 'chat.reportSentenceCalibrationClaim',
  paper_expiry: 'chat.reportSentencePaperExpiry',
} as const satisfies Record<ReportKind, MessageKey>;

/** The kind of a report message, for the sentence above. Null for a message that is not a report bubble. */
export function reportKindOf(message: Message): ReportKind | null {
  return isReportBubble(message) ? (reportOf(message)?.kind ?? null) : null;
}

/**
 * The overlay's first frame, built from the message the dealer tapped: the tag, the snapshot it
 * carries (the server has already taken an owner's money out of a manager's copy) and its stored
 * pictures. With it the report opens at once, and with no network at all; the server's copy then
 * adds what the message cannot know ("a newer report", "corrected"). Null for a message that is
 * not a report bubble.
 *
 * `headline` is the message's words as this reader sees them (the caller passes the reader's own
 * language), so an old picture-only report still says what it is.
 */
export function reportRowOf(message: Message, headline: string | undefined): TodayReport | null {
  if (!isReportBubble(message)) return null;
  const tag = reportOf(message);
  if (!tag) return null;
  const data = reportDataOf(tag.data, tag.kind);
  return {
    id: message.id,
    kind: tag.kind,
    status: tag.status,
    ...(tag.day ? { day: tag.day } : {}),
    sentAt: message.createdAt,
    headline: headline ?? '',
    attachments: [...message.attachments],
    conversationId: message.conversationId,
    messageId: message.id,
    ...(message.fuelCard ? { fuelCard: message.fuelCard } : {}),
    ...(data ? { data } : {}),
  };
}
