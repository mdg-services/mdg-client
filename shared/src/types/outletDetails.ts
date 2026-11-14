/**
 * Pump details — a short form the dealer fills about their petrol pump, inside
 * their chat (पंप की जानकारी).
 *
 * WHY A FORM, AND WHY THE SERVER OWNS IT. The first question is which state the
 * pump stands in: bank holidays are declared state by state, and they move the
 * outlet's Credit & DOD payment deadlines. More questions will follow. So the
 * question list lives in ONE server file (mdg-backend
 * `src/services/outletDetails/questions.ts`) and travels to the app and the admin
 * with every read: each question carries its own kind, words (Hindi and
 * English), options and limits. Adding a question is an edit to that file and a
 * server deploy — no app or admin release, no new types here, and no guide video
 * goes stale, because nothing on screen counts or names the questions.
 *
 * WHERE IT IS ASKED. An MDG message carrying `outletDetails` (see
 * `conversation.ts`) is posted into the owners' chat: during onboarding right
 * after the oil company is chosen, and to existing outlets that are missing an
 * answer the server needs. The message is only a frame; the app draws the form
 * from `GET /me/outlet-details` — the outlet's answers NOW — so an old message
 * always shows the current answers, and one answer from any owner answers for
 * all. Nothing waits on it: onboarding moves on whether or not it is filled.
 *
 * WHO ANSWERS. An owner, in the app (`PUT /me/outlet-details`); or an admin for
 * the dealer (`GET`/`PUT /dealers/:id/outlet-details`). A manager sees the form
 * read-only.
 */

/**
 * How a question is answered.
 *  - `state`  one Indian state, from `options` (value = two-digit GST state code)
 *  - `choice` one of `options`
 *  - `text`   free text, up to `maxLength`
 *  - `number` a number, within `min`/`max` when given
 *  - `yesno`  yes or no (value = boolean)
 *  - `date`   a calendar day, `YYYY-MM-DD`
 */
export const OUTLET_DETAIL_KINDS = ['state', 'choice', 'text', 'number', 'yesno', 'date'] as const;
export type OutletDetailKind = (typeof OUTLET_DETAIL_KINDS)[number];

/** Words in both languages the app speaks. The app picks by the reader's language. */
export interface OutletDetailWords {
  hi: string;
  en: string;
}

export interface OutletDetailOption {
  /** What is saved. For `state`, the two-digit GST state code ('10' = Bihar). */
  value: string;
  label: OutletDetailWords;
}

/** One answer's value. `null` = not answered. */
export type OutletDetailValue = string | number | boolean | null;

/** One question, as the server defines it. Unknown future fields must be ignored by readers. */
export interface OutletDetailQuestion {
  /** Stable key, lower-case snake case ('pump_state'). Never reused for another question. */
  id: string;
  kind: OutletDetailKind;
  label: OutletDetailWords;
  /** One short line under the question: why it is asked. */
  help?: OutletDetailWords;
  /** For `state` and `choice`, in the order to show (the app may sort `state` by its reader's alphabet). */
  options?: OutletDetailOption[];
  /** The form counts as complete only when every required question has an answer. */
  required: boolean;
  /** `text`: the longest answer accepted. */
  maxLength?: number;
  /** `number`: the smallest and largest accepted. */
  min?: number;
  max?: number;
  /** A hint inside an empty `text`/`number` box. */
  placeholder?: OutletDetailWords;
}

/** Where one question's answer stands. */
export interface OutletDetailAnswer {
  /** The saved answer, or null when nobody has answered. */
  value: OutletDetailValue;
  /** When it was saved (ISO), or null. */
  savedAt: string | null;
  /** Who saved it: the dealer in the app, or MDG's team for them. */
  savedVia: 'dealer' | 'admin' | null;
  /** The saver's name — shown to admins only; null for the dealer's own view. */
  savedByName: string | null;
  /**
   * A value MDG already holds from elsewhere, offered pre-selected while the
   * question is unanswered (the bill-to state for `pump_state`). It is NOT an
   * answer: the dealer still presses Save.
   */
  suggested: OutletDetailValue;
}

export interface OutletDetailsQuestionView extends OutletDetailQuestion {
  answer: OutletDetailAnswer;
}

/** `GET /me/outlet-details`, `GET /dealers/:id/outlet-details`, and every save's reply. */
export interface OutletDetailsView {
  /** Form title and one-line intro, from the server so they can change without a release. */
  title: OutletDetailWords;
  intro: OutletDetailWords;
  questions: OutletDetailsQuestionView[];
  /** Every required question has an answer. */
  complete: boolean;
  /** This reader may save answers: an owner, or an admin. A manager reads only. */
  canEdit: boolean;
}

/**
 * The marker on an MDG message that carries the Pump details form. Empty on
 * purpose: the app draws the form from `GET /me/outlet-details`.
 */
export type MessageOutletDetails = Record<string, never>;
