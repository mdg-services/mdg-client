import { cn } from '@/lib/cn';

/**
 * ONE LOOK FOR THE CHAT, in the dealer app and in the admin (ADR 0060).
 *
 * This file is copied byte for byte into both apps (`mdg-client/src/features/chat/chatLook.ts`
 * and `mdg-admin/src/features/chat/chatLook.ts`); a test in each app checks the two are
 * the same. Change it in both or in neither.
 *
 * The rule it carries: a message looks the same wherever it is read. Its colour comes from
 * WHO SENT IT (the team's: white; the dealer's: stone), never from which side of the screen
 * it sits on. The only thing that differs between the two apps is the side:
 *
 *   dealer app   the dealer's own on the right, the team's on the left
 *   admin        the team's own on the right, the dealer's on the left
 *
 * Sizes come from the app's type scale (`text-body`, `text-meta`, `text-micro`), the same
 * names in both apps, so the same words wrap in the same places on a phone and on a desktop.
 */

export type ChatViewer = 'dealer' | 'admin';
export type ChatSide = 'left' | 'right';

/** Which side a message sits on for the person reading it. */
export function sideOf(viewer: ChatViewer, fromMdg: boolean): ChatSide {
  return (viewer === 'dealer') === fromMdg ? 'left' : 'right';
}

/** The hairline shadow every bubble, chip and pill in the thread carries. */
export const CHAT_SHADOW = 'shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]';

export const chatLook = {
  /** The row a message sits in: pushes the bubble to its side. */
  row: (side: ChatSide) => cn('flex w-full', side === 'right' ? 'justify-end' : 'justify-start'),

  /**
   * The column holding the bubble and what hangs off it (choices, reactions). A wide one
   * (a picture, a card, a request) is as wide as a picture; a text bubble wraps at 80%,
   * capped so a desktop column is never wider than a phone's.
   */
  column: (side: ChatSide, wide: boolean) =>
    cn('flex flex-col', side === 'right' ? 'items-end' : 'items-start', wide ? 'w-[min(80%,330px)]' : 'max-w-[min(80%,420px)]'),

  /** The bubble itself. `padded` is a bubble of words; otherwise it wraps a picture or a card. */
  bubble: ({
    fromMdg,
    side,
    first,
    wide,
    padded,
  }: {
    fromMdg: boolean;
    side: ChatSide;
    first: boolean;
    wide: boolean;
    padded: boolean;
  }) =>
    cn(
      'relative min-w-0 rounded-md text-wa-bubble-text',
      CHAT_SHADOW,
      wide && 'w-full',
      fromMdg ? 'bg-wa-in' : 'bg-wa-out',
      first && (side === 'right' ? 'rounded-tr-none' : 'rounded-tl-none'),
      padded ? 'px-[9px] pb-[7px] pt-[6px]' : 'p-[3px]',
    ),

  /** The wedge on the first bubble of a run: hangs off the top corner, in the bubble's colour. */
  tail: (fromMdg: boolean, side: ChatSide) =>
    cn(
      'pointer-events-none absolute top-0 fill-current',
      side === 'right' ? '-right-[7px] scale-x-[-1]' : '-left-[7px]',
      fromMdg ? 'text-wa-in' : 'text-wa-out',
    ),

  /** The words of a message. */
  words: 'whitespace-pre-wrap break-words text-body leading-[1.35] [&_a]:text-wa-accent-strong [&_a]:underline',

  /** A sender's name above their words. */
  name: 'block truncate text-meta font-medium leading-tight',

  /** The time and ticks in the bubble's corner. */
  meta: 'flex items-center gap-1 whitespace-nowrap text-micro leading-none',

  /** A quoted message inside a reply. */
  quote: 'mb-1 flex w-full items-stretch overflow-hidden rounded-md bg-black/[0.06] text-left',
  quoteName: 'block truncate text-meta font-medium leading-tight text-wa-accent-strong',
  quoteWords: 'flex items-center gap-1 text-meta leading-snug text-wa-meta',

  /** A reaction hanging off a bubble's bottom edge. */
  reaction: `flex items-center gap-0.5 rounded-full border bg-wa-in px-1.5 py-0.5 text-meta ${CHAT_SHADOW}`,
  reactionCount: 'text-micro tabular-nums text-wa-meta',

  /** The day ("Today", "Yesterday", a date) between messages. */
  dayChip: `rounded-lg bg-wa-chip px-3 py-1 text-meta leading-tight text-wa-chip-text ${CHAT_SHADOW}`,

  /** The thread's backdrop. */
  wallpaper: 'bg-wa-wallpaper text-wa-bubble-text',

  /** The bar the typing box sits in, and the box and the send button themselves. */
  composerBar: 'bg-wa-wallpaper',
  composerField: 'rounded-3xl bg-wa-chip shadow-sm',
  composerInput: 'text-body leading-snug text-wa-bubble-text placeholder:text-wa-meta',
  sendButton: 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-accent text-white',
} as const;
