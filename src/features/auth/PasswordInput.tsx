import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Input, type InputProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/**
 * A password box with an eye to show what was typed.
 *
 * A phone keyboard hides every letter and a mistyped password is the commonest
 * reason a dealer is locked out, so each box can be uncovered. Never
 * autocapitalised or autocorrected: a password that the keyboard "fixes" is one
 * nobody can type again.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { className, ...rest },
  ref,
) {
  const t = useT();
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn('pr-12', className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={show}
        className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-text-subtle active:bg-surface-2"
      >
        {show ? (
          <EyeOff width={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <Eye width={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
});
