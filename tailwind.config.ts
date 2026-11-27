import type { Config } from 'tailwindcss';

export default {
  // Gate every `hover:` utility behind @media (hover: hover). Touch devices
  // latch :hover after a tap, so without this a tapped button stays visually
  // highlighted; the matching active: press states (see Button.tsx) give the
  // real touch feedback instead.
  future: { hoverOnlyWhenSupported: true },
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        'text-subtle': 'var(--color-text-subtle)',
        'text-inverse': 'var(--color-text-inverse)',
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover: 'var(--color-brand-hover)',
          soft: 'var(--color-brand-soft)',
        },
        'focus-ring': 'var(--color-focus-ring)',
        success: { DEFAULT: '#16a34a', soft: '#dcfce7' },
        // `strong` is the only amber white may sit on. The palette's DEFAULT
        // (#d97706) against `soft` (#fef3c7) computes to 2.86:1 and white on
        // #d97706 to 2.15:1 — both fail WCAG AA at every size, which matters
        // more here than anywhere else in the app: the reader is 55, outdoors,
        // under a canopy, on a cheap screen. White on #92400e is 7.09:1.
        warning: { DEFAULT: '#d97706', soft: '#fef3c7', strong: '#92400e' },
        danger: { DEFAULT: '#dc2626', soft: '#fee2e2' },
        info: { DEFAULT: '#2563eb', soft: '#dbeafe' },
        neutral: { DEFAULT: '#475569', soft: '#e2e8f0' },
        // Report families (ADR 0056): `bg-kind-dsr` is the header fill (white text on it),
        // `bg-kind-dsr-soft` the tint behind a drawing, `text-kind-dsr-ink` text on the page.
        // Values and their dark pairs live in index.css (`--kind-*`). One per family, in
        // reading order: DSR, stock, tanker, credit, ledger, claim, water, supply, paper,
        // paperwork, Kavach, news.
        kind: {
          dsr: { DEFAULT: 'var(--kind-dsr)', soft: 'var(--kind-dsr-soft)', ink: 'var(--kind-dsr-ink)' },
          stock: { DEFAULT: 'var(--kind-stock)', soft: 'var(--kind-stock-soft)', ink: 'var(--kind-stock-ink)' },
          tanker: { DEFAULT: 'var(--kind-tanker)', soft: 'var(--kind-tanker-soft)', ink: 'var(--kind-tanker-ink)' },
          credit: { DEFAULT: 'var(--kind-credit)', soft: 'var(--kind-credit-soft)', ink: 'var(--kind-credit-ink)' },
          ledger: { DEFAULT: 'var(--kind-ledger)', soft: 'var(--kind-ledger-soft)', ink: 'var(--kind-ledger-ink)' },
          claim: { DEFAULT: 'var(--kind-claim)', soft: 'var(--kind-claim-soft)', ink: 'var(--kind-claim-ink)' },
          water: { DEFAULT: 'var(--kind-water)', soft: 'var(--kind-water-soft)', ink: 'var(--kind-water-ink)' },
          supply: { DEFAULT: 'var(--kind-supply)', soft: 'var(--kind-supply-soft)', ink: 'var(--kind-supply-ink)' },
          paper: { DEFAULT: 'var(--kind-paper)', soft: 'var(--kind-paper-soft)', ink: 'var(--kind-paper-ink)' },
          paperwork: { DEFAULT: 'var(--kind-paperwork)', soft: 'var(--kind-paperwork-soft)', ink: 'var(--kind-paperwork-ink)' },
          kavach: { DEFAULT: 'var(--kind-kavach)', soft: 'var(--kind-kavach-soft)', ink: 'var(--kind-kavach-ink)' },
          news: { DEFAULT: 'var(--kind-news)', soft: 'var(--kind-news-soft)', ink: 'var(--kind-news-ink)' },
        },
        // The five statuses, each drawn with its own shape and a word, never colour alone.
        status: {
          problem: { DEFAULT: 'var(--status-problem)', soft: 'var(--status-problem-soft)', ink: 'var(--status-problem-ink)' },
          attention: { DEFAULT: 'var(--status-attention)', soft: 'var(--status-attention-soft)', ink: 'var(--status-attention-ink)' },
          waiting: { DEFAULT: 'var(--status-waiting)', soft: 'var(--status-waiting-soft)', ink: 'var(--status-waiting-ink)' },
          ok: { DEFAULT: 'var(--status-ok)', soft: 'var(--status-ok-soft)', ink: 'var(--status-ok-ink)' },
          info: { DEFAULT: 'var(--status-info)', soft: 'var(--status-info-soft)', ink: 'var(--status-info-ink)' },
        },
        // Fuel swatches: beside the fuel letters (HSD, MS, XP, XG), never the only cue.
        fuel: {
          diesel: 'var(--fuel-diesel)',
          petrol: 'var(--fuel-petrol)',
          other: 'var(--fuel-other)',
        },
        // The chat's WhatsApp palette — values live in index.css (`--wa-*`).
        wa: {
          accent: 'var(--wa-accent)',
          'accent-strong': 'var(--wa-accent-strong)',
          badge: 'var(--wa-badge)',
          bar: 'var(--wa-bar)',
          'bar-text': 'var(--wa-bar-text)',
          'bar-icon': 'var(--wa-bar-icon)',
          wallpaper: 'var(--wa-wallpaper)',
          in: 'var(--wa-in)',
          out: 'var(--wa-out)',
          'bubble-text': 'var(--wa-bubble-text)',
          meta: 'var(--wa-meta)',
          'tick-read': 'var(--wa-tick-read)',
          chip: 'var(--wa-chip)',
          'chip-text': 'var(--wa-chip-text)',
          notice: 'var(--wa-notice)',
          select: 'var(--wa-select)',
          'search-hit': 'var(--wa-search-hit)',
          'row-active': 'var(--wa-row-active)',
          divider: 'var(--wa-divider)',
          viewer: 'var(--wa-viewer)',
        },
      },
      /**
       * The app's type scale: one size per job, in rem so a phone set to large text grows every
       * line with it. Weight rides with the size where the job fixes it (a heading is always
       * semibold), and a `font-*` class still overrides it. The reader is 55, outdoors, on a cheap
       * screen, reading Devanagari: body text never goes under 16 px, secondary text never under
       * 14 px, and 12 px is kept for counts and tiny marks only.
       *
       *   display     32  big figures (a report's headline number)
       *   title       22  a screen's title (page h1, report title, greeting)
       *   heading     18  a section's heading on a page
       *   subheading  17  semibold: a card's or a row's title, a field's label
       *   body        16  sentences: descriptions, explanations, message text
       *   cta         16  semibold: the words on a button or a link-button
       *   meta        14  secondary lines: dates, times, a status tag, a count, a hint
       *   micro       12  a badge's count, a legend mark, a chart's axis
       */
      fontSize: {
        display: ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        title: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        heading: ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em', fontWeight: '600' }],
        subheading: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        cta: ['1rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        meta: ['0.875rem', { lineHeight: '1.25rem' }],
        micro: ['0.75rem', { lineHeight: '1rem' }],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
      /**
       * `min-h-tap`: a tap floor of 44 CSS pixels, NOT scaled by the reader's text size. Everything
       * else here is in rem and grows with the text (a `min-h-11` button is 88 px tall at 200%).
       * That is right for a row, and wrong for the one strip that lives at the bottom of every door: at
       * 200% text a bar of 88 px doors is a third of a 640 px phone. WCAG's target size is a size on
       * the screen, so this floor is held in pixels and the label inside still grows and wraps (it is
       * a MINIMUM, it never clips). Used by the bar at large text and nowhere else yet.
       */
      minHeight: { tap: '44px' },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,0.06)',
        md: '0 4px 12px rgba(15,23,42,0.08)',
        lg: '0 16px 40px rgba(15,23,42,0.16)',
      },
      fontFamily: {
        // Native system stack — zero webfont download. On the target low-end
        // Android phones this resolves to Roboto (highly legible); iOS uses SF.
        // Devanagari (Hindi) falls through to the on-device Noto, which is free.
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
