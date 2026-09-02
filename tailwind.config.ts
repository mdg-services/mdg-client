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
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
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
