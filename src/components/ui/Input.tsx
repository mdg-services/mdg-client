import * as React from 'react';

import { cn } from '@/lib/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'min-h-11 w-full rounded-md border bg-surface px-4 text-body text-text shadow-sm',
          'placeholder:text-text-subtle',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          invalid ? 'border-danger' : 'border-border',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      />
    );
  },
);
