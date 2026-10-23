import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { BrandMark } from '@/components/BrandMark';
import { Button, Card, CardContent, useToast } from '@/components/ui';
import { ApiError, api, apiFetch } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

import { PasswordInput } from './PasswordInput';

type FormValues = { currentPassword: string; newPassword: string; confirmPassword: string };

/** The route that answers while a temporary password is still in force. */
const CHANGE_PASSWORD_PATH = '/v1/auth/change-password';

/** What a refused change says. Only a wrong current password is something the dealer can fix. */
function changeErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    // The server answers a wrong current password with 400 CURRENT_PASSWORD_WRONG
    // (not 401, which the app reads as "signed out"); 401 is kept for safety.
    if (err.code === 'CURRENT_PASSWORD_WRONG' || err.status === 401) return 'auth.forcedCurrentWrong';
    if (err.status === 429) return 'auth.tooManyTries';
  }
  return 'profile.passwordChangeFailed';
}

/**
 * The screen a member sees BEFORE anything else when they signed in with a
 * temporary password (one MDG's team gave them): choose your own.
 *
 * It replaces the whole app, not a part of it. The server refuses every other
 * call from this member until the password is changed, so there is nothing
 * behind it that would load; `ProtectedLayout` swaps it for the app the moment
 * the profile says the password is no longer temporary.
 *
 * What was typed lives only in this form and in the one request. The mutation's
 * own copy of it is dropped as soon as the call settles (`gcTime: 0`).
 */
export function ForcedPasswordChange() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  // The profile on this phone may be older than the server's. If the password
  // was already changed somewhere else, asking again would be asking for a
  // "current password" nobody has any more — so ask the server first. `/me` is
  // one of the three calls a temporary password may make.
  React.useEffect(() => {
    let live = true;
    api
      .get<User>('/v1/me')
      .then((fresh) => {
        if (live) setUser(fresh);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [setUser]);

  const schema = React.useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('common.required')),
          newPassword: z.string().min(8, t('profile.min8')),
          confirmPassword: z.string().min(1, t('common.required')),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          path: ['confirmPassword'],
          message: t('profile.passwordsDontMatch'),
        })
        .refine((v) => v.newPassword !== v.currentPassword, {
          path: ['newPassword'],
          message: t('auth.forcedMustDiffer'),
        }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // The server went through with it but still calls the password temporary.
  const [stuck, setStuck] = React.useState(false);

  const change = useMutation({
    gcTime: 0,
    mutationFn: async (v: FormValues) => {
      await apiFetch<unknown>(CHANGE_PASSWORD_PATH, {
        method: 'POST',
        body: { currentPassword: v.currentPassword, newPassword: v.newPassword },
        // A 401 here is a wrong current password, not a finished session.
        signOutOn401: false,
      });
      // Refresh the profile: its `mustChangePassword` flag is what lets go of this screen.
      return api.get<User>('/v1/me');
    },
    onSuccess: (fresh) => {
      qc.setQueryData(['me'], fresh);
      setUser(fresh);
      // Whatever was refused while the password was temporary asks again.
      void qc.invalidateQueries();
      if (fresh.mustChangePassword) setStuck(true);
      else toast.success(t('profile.passwordChanged'));
    },
  });

  // Done: drop the mutation's own copy of what was typed (both passwords).
  const { isSuccess, reset: resetChange } = change;
  React.useEffect(() => {
    if (isSuccess) resetChange();
  }, [isSuccess, resetChange]);

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <BrandMark size={48} className="text-text" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-text">
            {t('auth.forcedTitle')}
          </h1>
          <p className="text-sm leading-relaxed text-text-muted">{t('auth.forcedIntro')}</p>
        </div>
        <Card>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => {
                setStuck(false);
                change.mutate(v);
              })}
              className="flex flex-col gap-4"
              noValidate
            >
              <Field id="fp-current" label={t('auth.forcedCurrent')} error={errors.currentPassword?.message}>
                <PasswordInput
                  id="fp-current"
                  autoComplete="current-password"
                  invalid={!!errors.currentPassword}
                  {...register('currentPassword')}
                />
              </Field>
              <Field id="fp-new" label={t('profile.newPassword')} error={errors.newPassword?.message}>
                <PasswordInput
                  id="fp-new"
                  autoComplete="new-password"
                  invalid={!!errors.newPassword}
                  {...register('newPassword')}
                />
              </Field>
              <Field
                id="fp-confirm"
                label={t('auth.forcedConfirm')}
                error={errors.confirmPassword?.message}
              >
                <PasswordInput
                  id="fp-confirm"
                  autoComplete="new-password"
                  invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
              </Field>

              {change.isError || stuck ? (
                <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                  {t(change.isError ? changeErrorKey(change.error) : 'profile.passwordChangeFailed')}
                </p>
              ) : null}

              <Button type="submit" size="lg" fullWidth loading={change.isPending}>
                {t('auth.forcedSave')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <button
          type="button"
          onClick={logout}
          className="mx-auto mt-4 flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-text-muted underline underline-offset-4"
        >
          {t('auth.forcedSignOut')}
        </button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-text" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
