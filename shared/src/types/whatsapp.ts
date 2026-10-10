/**
 * WhatsApp replies — what people have written back to our business number,
 * as the admin's WhatsApp page lists them.
 *
 * The number is run through Meta's Cloud API, so there is no phone with a
 * WhatsApp app on it where a reply would simply turn up. A reply lands in our
 * database and nowhere else; this page, and the alert that points at it, are
 * the only places a person will ever see one.
 */

export interface WhatsAppReplyMessage {
  /** Meta's id for the message. */
  id: string;
  at: string;
  /** What Meta calls it: `text`, `button`, `image`, … */
  kind: string | null;
  /** The words, or the label of the button tapped. Null for a photo or a voice note. */
  text: string | null;
  /** The person said stop — and, when `stopRecorded` is false, we could not tell whose number it is. */
  stop: boolean;
  stopRecorded: boolean;
  seenAt: string | null;
}

/** Everything one person has sent us, newest message last. */
export interface WhatsAppReplyThread {
  /**
   * Names the person: their number, or Meta's own id for them when it
   * withheld the number (it does for someone with a WhatsApp username).
   */
  person: string;
  phone: string | null;
  /** The name on their WhatsApp profile. */
  profileName: string | null;
  /** The name we greeted them by, when we have sent them a campaign. */
  listName: string | null;
  /** Messages still to be read. A recorded stop needs no reading and is not counted. */
  unread: number;
  lastAt: string;
  /** On the stop list: no promotion will go to this number. */
  optedOut: boolean;
  messages: WhatsAppReplyMessage[];
}

export interface WhatsAppReplyList {
  items: WhatsAppReplyThread[];
  /** People with something unread — what the alert count comes to. */
  counts: { unread: number };
}
