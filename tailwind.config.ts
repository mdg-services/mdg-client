import type { Config } from 'tailwindcss';

export default {
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
        warning: { DEFAULT: '#d97706', soft: '#fef3c7' },
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
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
