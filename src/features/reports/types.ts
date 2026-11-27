import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

import type { Lang } from '@/store/lang';
import type { ReportDataOf, ReportDetail, ReportKind, TodayTaskKind } from '@dk/shared/types';


/**
 * The contract every report kind fills in (ADR 0056). A kind lives in
 * `kinds/<kind>.tsx` and exports `view: KindView<'<kind>'>`; `registry.ts` collects
 * them all and `getKindView(kind)` hands one out.
 *
 * Everything a kind says is written in its own file as a {@link Words} object and
 * picked with {@link sayWords}: hi (Devanagari), hl (Hinglish, Latin letters) and en.
 * Do not add a kind's sentences to `lib/i18n.ts`. The snapshot holds numbers, codes and
 * dates only, so every sentence is built here, in the reader's language.
 */

/** A sentence in all three languages. Typed so a missing one does not compile. */
export type Words = Record<Lang, string>;

/** The words in `lang`; falls back to Hinglish, then English, if one is ever empty. */
export function sayWords(w: Words, lang: Lang): string {
  return w[lang] || w.hl || w.en;
}

/**
 * How a report stands, for a tile, an alert or a row. Always drawn with its own shape
 * and a word (`StatusBadge`), never colour alone: `problem` octagon, `attention`
 * triangle, `waiting` clock, `ok` tick, `info` the letter i.
 */
export type ReportStatusKey = 'problem' | 'attention' | 'waiting' | 'ok' | 'info';

/** One line of a tile's figures: the name on the left, the number on the right. */
export interface TileRow {
  /** What the number is about ("Diesel"). */
  label: string;
  /** The number, already formatted ("14,920 L", "+908 L"). */
  value: string;
  /** A short word or figure beside the label ("over", "+4%"). */
  hint?: string;
  /** The row has no figure to show ("No reading"): it is drawn quietly, not as a number. */
  quiet?: boolean;
}

/**
 * What a Today tile shows: the one big value, one small line, and how it stands.
 *
 * `value` and `sub` are the tile's whole meaning in plain words: they are what a screen reader hears
 * and what a plain-text summary uses. `rows` and `lines` are the same facts set out for the eye: a
 * tile that speaks for several fuels draws one row per fuel instead of one long sentence, and each
 * small fact sits on its own line instead of between dots.
 */
export interface KindTile {
  /** The big text, already formatted ("24,330 L", "10 / 12", "All fine"). */
  value: string;
  /** The small text under it ("lasts 4 days"), facts joined with " · ". */
  sub?: string;
  status?: ReportStatusKey;
  /**
   * One row per fuel (or per thing). Two or more rows make the tile full width and replace the big
   * value; one row shows its label small above its figure.
   */
  rows?: TileRow[];
  /**
   * The small facts, one per line, drawn instead of `sub`. Without it the tile cuts `sub` at each
   * " · ", so a kind that joins its facts with dots gets one fact per line without any extra work.
   */
  lines?: string[];
}

/** What a "Needs a look" card shows: one plain headline, one line, how hard it knocks. */
export interface KindAlert {
  headline: string;
  line: string;
  severity: 'problem' | 'attention';
  /** Breaks a tie inside one severity: the higher weight is listed first (default 0). */
  weight?: number;
}

/**
 * What a report's own button may do (ADR 0056). A kind never touches the router, the socket or the
 * clipboard itself: the overlay hands it this, built for the report on screen, so every kind's
 * button behaves the same way and a test can fake the whole thing in one object.
 */
export interface ReportActionContext {
  lang: Lang;
  /** The person is the pump's owner. A manager is not offered an owner's buttons (ordering fuel). */
  isOwner: boolean;
  /** The time now, in ms. A function so a test can hold the clock still. */
  now: () => number;
  /** Go to an address of the app (a settings page, the Credit & DOD report's chat). */
  navigate: (to: string) => void;
  /** The chat this report came in, at one of its messages. */
  openChatAt: (messageId: string) => void;
  /**
   * The chat, at the box that asks for `askRef` (`doc:`, `reg:` or `kv:` plus an id): the exact
   * message, found through the Today feed's open tasks or the thread's loaded messages. Falls back to
   * the report's own message when the box cannot be found, so the button never does nothing.
   */
  openChatAtAsk: (askRef: string) => void;
  /** The chat, at the newest box of an open job (the DU OTP steps, the mock drill, the declarations). Same fallback. */
  openChatAtTask: (kind: TodayTaskKind) => void;
  /** The chat with a sentence typed in the message box and NOT sent: the dealer reads it and taps send. */
  draftInChat: (text: string) => void;
  /** Put text on the clipboard. False when the phone refused. */
  copy: (text: string) => Promise<boolean>;
  toast: { success: (message: string) => void; error: (message: string) => void };
  /** Send a sentence into this report's chat, as the dealer. Rejects when it did not go. */
  sendChat: (text: string) => Promise<void>;
}

/**
 * One of the (at most two) buttons a report offers in the overlay's pinned bar, in front of Share
 * and See in chat. The label says what the tap does; the icon never carries the meaning alone.
 */
export interface ReportAction {
  /** Stable, for the test id and for remembering a "once" action was used. */
  id: string;
  label: Words;
  icon?: LucideIcon;
  run: (ctx: ReportActionContext) => void | Promise<void>;
  /**
   * Not available now. The button is drawn greyed out (still readable and still in the page's
   * order) with `note` under the bar, so the dealer learns WHEN, not just "no".
   */
  disabled?: { note: string };
  /** Stays greyed out after a successful run for as long as the overlay is open (a question already asked). */
  once?: boolean;
}

export interface OverlayProps<K extends ReportKind> {
  /** The snapshot, of this kind and version (the overlay shell checks before it draws). */
  data: ReportDataOf<K>;
  /** The whole report as the server sent it: the tag, the live state, the signed pictures. */
  report: ReportDetail;
  lang: Lang;
}

/** Everything the app knows how to say and draw about one kind. */
export interface KindView<K extends ReportKind = ReportKind> {
  kind: K;
  /** The body of the overlay: the signature picture, the lead sentence, the details. The shell draws the header, the banners and the buttons. */
  Overlay: ComponentType<OverlayProps<K>>;
  /** The 40 x 28 mini signature for a tile or a history row: the same shape the overlay opens with. */
  Glyph: ComponentType<{ size?: number }>;
  /** The Today tile for this report, or null when it has none (most kinds are not tiles). */
  tile: (data: ReportDataOf<K>, lang: Lang) => KindTile | null;
  /** The "Needs a look" card, or null when the snapshot has nothing to flag. */
  alert: (data: ReportDataOf<K>, lang: Lang) => KindAlert | null;
  /** One plain line for a history row ("Diesel 310 L short", "Rs 1,24,000 by 27 Nov"). */
  headline: (data: ReportDataOf<K>, lang: Lang) => string;
  /** A plain-text summary that fits a WhatsApp message, for the Share button. */
  share: (data: ReportDataOf<K>, lang: Lang) => string;
  /**
   * Up to two buttons for the pinned bar (see {@link ReportAction}), or none. Computed on every
   * render from the snapshot and the live report, so a lock that ends shows up without a reload.
   */
  actions?: (data: ReportDataOf<K>, report: ReportDetail, ctx: ReportActionContext) => ReportAction[];
}
