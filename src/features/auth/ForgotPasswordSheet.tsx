import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import * as React from 'react';

import { Button, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';

import { parseIdentifier } from './identifier';

/**
 * "Forgot your password?" from the sign-in screen.
 *
 * There is no code that proves a phone is theirs (owner's decision), and the
 * dealer is signed out, so nothing here resets anything. It raises a request on
 * the Onboarding page; MDG's team calls the registered number and gives a
 * temporary password, which the dealer must replace at their first sign-in.
 *
 * THE SCREEN NEVER SAYS WHETHER AN ACCOUNT MATCHED. The server answers every
 * request the same way, and so does this: a stranger typing numbers learns
 * nothing about who has an account.
 */
export function ForgotPasswordSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const panelRef = useDialog(onClose);
  const titleId = React.useId();
  const fieldId = React.useId();
  const [typed, setTyped] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);

  const ask = useMutation({
    mutationFn: (identifier: string) =>
      // A 401 here is not "your session is over": there is no session.
      apiFetch<unknown>('/v1/auth/forgot-password', {
        method: 'POST',
        body: { identifier },
        signOutOn401: false,
      }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseIdentifier(typed);
    if (!id) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    ask.mutate(id.value);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto flex w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface pb-4 shadow-lg outline-none safe-bottom sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {t('auth.forgotTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.dismiss')}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-muted active:bg-surface-2"
          >
            <X width={20} strokeWidth={1.75} />
          </button>
        </div>

        {ask.isSuccess ? (
          <div className="px-5 pt-1" role="status" aria-live="polite">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-white">
                <Check width={14} strokeWidth={2.4} />
              </span>
              <p className="text-base font-medium leading-snug text-text">
                {t('auth.forgotDone')}
              </p>
            </div>
            <Button size="lg" fullWidth className="mt-5" onClick={onClose}>
              {t('auth.forgotOk')}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3 px-5 pt-1">
            <p className="text-sm leading-relaxed text-text-muted">{t('auth.forgotIntro')}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="text-sm font-medium text-text">
                {t('auth.identifier')}
              </label>
              <Input
                id={fieldId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={200}
                invalid={invalid}
                placeholder={t('auth.identifierPlaceholder')}
              />
              {invalid ? (
                <p className="text-xs text-danger">{t('auth.identifierInvalid')}</p>
              ) : null}
            </div>
            {ask.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t('common.networkError')}
              </p>
            ) : null}
            <Button type="submit" size="lg" fullWidth loading={ask.isPending}>
              {t('auth.forgotSend')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
