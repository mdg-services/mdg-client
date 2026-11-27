/**
 * THE LIVING CARD (ADR 0059). One card per flow per chat, answered by tapping.
 *
 * Owner, 26 Nov 2026: every multi-step question MDG asks a dealer is one card that
 * holds every question as a row. A row has pill choices (the picked one filled), turns
 * into a green tick when answered, and a problem shows inside the card as a red row
 * with one plain sentence. Two buttons sit at the foot. The card never becomes a stream
 * of question messages: it changes in place.
 *
 * THE SERVER DRAWS IT, THE APP ONLY PAINTS IT. A message carries a marker
 * (`Message.flowCard`) naming the flow and its record; the app asks
 * `GET /me/flow-cards/:flow/:ref` for the card as it is NOW and paints the rows it is
 * given. So the dealer app and the admin chat paint the very same card, a message
 * posted yesterday shows today's state, and a flow's wording lives in one place.
 *
 * ONE CARD ON SCREEN. When the card has to move (the dealer typed instead of tapping,
 * and MDG answered), the server posts a new message with the marker and names it in
 * `liveMessageId`. Only that message paints the card; an older one with the same marker
 * paints nothing in the dealer app (a muted one-line note in the admin).
 *
 * Every word comes in each dealer language; the app picks the reader's own with `sayIn`.
 * Figures, dates and codes are already inside the words.
 */
import type { SomeDealerWords } from './dealerLanguage';

/** The flows drawn as a living card. A flow added here gets its own server adapter. */
export const FLOW_CARD_FLOWS = ['fuel_order'] as const;
export type FlowCardFlow = (typeof FLOW_CARD_FLOWS)[number];

/** The marker on a message that paints a living card. */
export interface MessageFlowCard {
  flow: FlowCardFlow;
  /** The flow's own record (a fuel order draft's id). */
  ref: string;
}

/**
 * Where a row stands:
 *  - `done`: answered; painted as a green tick and the answer in one line.
 *  - `open`: the one to answer now (or one of several open at once); painted with its pills.
 *  - `later`: cannot be answered yet; greyed.
 *  - `problem`: answered, but MDG or the portal cannot take it; a red "!" and the reason.
 *  - `working`: MDG is doing this now (placing the order); a small spinner and a line.
 */
export const FLOW_ROW_STATES = ['done', 'open', 'later', 'problem', 'working'] as const;
export type FlowRowState = (typeof FLOW_ROW_STATES)[number];

/** One pill. */
export interface FlowChoice {
  /** What the server takes back (`FlowCardAnswer.value`). Never shown. */
  value: string;
  /** A plain string is the same in every language ("12 KL"). */
  label: SomeDealerWords | string;
  /** The small line under a pill's words, when it has one (a closed depot day). */
  hint?: SomeDealerWords;
  /** Painted filled: the answer the record holds now. */
  selected?: boolean;
  /** Painted but not tappable (a day the depot loads nothing). */
  disabled?: boolean;
}

/** One question in the card. */
export interface FlowRow {
  /** The row's id, sent back with an answer (`delivery_date`, `kl:HSD`). */
  key: string;
  /** The question, short: "Kab chahiye?". On a `done` row it is the small label above the answer. */
  label: SomeDealerWords;
  state: FlowRowState;
  /** The answer in one line, on a `done` row ("Kal, 27 Nov"). */
  answer?: SomeDealerWords;
  /** One small line under the row: a fact that helps choose ("Tanker 12 KL: 4 + 4 + 4"). */
  note?: SomeDealerWords;
  /** The pills, on an `open` row (and on a `done` row the dealer may change in place). */
  choices?: FlowChoice[];
  /** A number the dealer may type instead of tapping, ticking the same row. */
  typed?: {
    kind: 'number';
    /** Words after the box ("KL"). */
    unit?: string;
    min: number;
    max: number;
    /** Digits after the point the server takes. */
    decimals: number;
  };
  /**
   * Drawn as a part of the row above it (a fuel's KL under "Kitna load?"): no number of
   * its own, the label on the left of the pills.
   */
  part?: boolean;
  /** A `done` row the dealer may tap to change: its pills open again. */
  canChange?: boolean;
}

/** A button at the card's foot. */
export interface FlowCardAction {
  /** Sent back as `FlowCardAction.id` (`place`, `retry`, `talk`, `drop`). */
  id: string;
  label: SomeDealerWords;
  /** `primary` is the filled black one; there is at most one. */
  tone: 'primary' | 'secondary';
  /**
   * Set on a button that is a message, not an act ("MDG se baat"): the app sends these
   * words, in the reader's language, as the dealer's own message, and MDG's team answers
   * it like any other. Nothing is posted to the action route.
   */
  say?: SomeDealerWords;
}

/** Where the whole card stands; drives the header's small word and the polling. */
export const FLOW_CARD_STATUSES = ['asking', 'ready', 'working', 'done', 'problem', 'closed'] as const;
export type FlowCardStatus = (typeof FLOW_CARD_STATUSES)[number];

/** `GET /me/flow-cards/:flow/:ref` — the card as it is now. */
export interface FlowCardView {
  flow: FlowCardFlow;
  ref: string;
  /** The one message that paints the card. Null before any message carries it. */
  liveMessageId: string | null;
  /** "नया लोड ऑर्डर". */
  title: SomeDealerWords;
  /** The outlet code and the time, already formatted ("904S · 4:10 pm"). */
  meta: string | null;
  /** "3 of 5 done" and the thin bar, for a flow whose rows are steps. Null to draw neither. */
  progress: { done: number; total: number } | null;
  status: FlowCardStatus;
  rows: FlowRow[];
  /**
   * The read-back on a `ready` card, and what happened on a finished one: short lines,
   * each its own sentence ("Kal, 27 Nov · Diesel 12 KL").
   */
  summary: SomeDealerWords[];
  /** A warning to read before the main button (the tanks may not hold it). Never blocks. */
  warnings: SomeDealerWords[];
  /** The red "!" row: one plain sentence, then up to two small lines of detail. */
  problem: { text: SomeDealerWords; detail: SomeDealerWords[] } | null;
  actions: FlowCardAction[];
  /**
   * Whether this reader may answer. A manager sees the owners' card read-only (no pills
   * tappable, no buttons). The admin's copy is always read-only.
   */
  canAnswer: boolean;
  /**
   * What the dealer confirms with the main button: the server refuses a `place` whose
   * stamp is not the record's stamp now, so a card that was stale on the phone can never
   * place an order the dealer did not see.
   */
  stamp: string;
  /** A short guide video for this flow, when the library has one. */
  video: { id: string; title: SomeDealerWords; seconds: number | null } | null;
}

/** `POST /me/flow-cards/:flow/:ref/answer`: a pill tapped, or a number typed. */
export interface FlowCardAnswer {
  row: string;
  value: string;
}

/** `POST /me/flow-cards/:flow/:ref/action`: a foot button. */
export interface FlowCardActionInput {
  action: string;
  /** The card's `stamp` when the button was drawn. */
  stamp: string;
}

/** Both posts answer with the card as it is after the change (and where it now lives). */
export interface FlowCardResult {
  card: FlowCardView;
  /** A new card was started (Dobara lagaiye): its ref, so the app can follow it. */
  nextRef?: string;
}
