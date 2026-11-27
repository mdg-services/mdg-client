import * as React from 'react';

import { cn } from '@/lib/cn';

import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'tap';

// `hover:` is gated to real pointers (tailwind hoverOnlyWhenSupported), so each
// variant carries a matching `active:` state to give a press flash on touch.
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-text-inverse hover:bg-brand-hover active:bg-brand-hover disabled:bg-brand/60',
  secondary:
    'bg-surface text-text border border-border shadow-sm hover:bg-surface-2 active:bg-surface-2',
  ghost: 'bg-transparent text-text hover:bg-surface-2 active:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/90',
};

// Every size is at least 44px (2.75rem) tall, and `min-h` rather than `h`, so a label that wraps at
// 200% text grows the button instead of spilling out of it (spec 3.1, 5).
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3 py-1 text-meta font-semibold gap-1.5',
  md: 'min-h-11 px-4 py-2 text-cta gap-2',
  lg: 'min-h-12 px-5 py-2 text-cta gap-2',
  icon: 'h-11 w-11 p-0',
  // The 44 px floor that does not grow with the text (`min-h-tap`, tailwind.config.ts): for the
  // few places that run out of screen at large text. The label still grows and wraps.
  tap: 'min-h-tap px-4 py-1 text-cta gap-2',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth,
      children,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          VARIANTS[variant],
          SIZES[size],
          fullWidth && 'w-full',
          className,
        )}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : leftIcon}
        {children ? <span>{children}</span> : null}
        {!loading && rightIcon}
      </button>
    );
  },
);
