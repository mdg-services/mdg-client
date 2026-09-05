import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';


import { BrandMark } from '@/components/BrandMark';
import { Button, Card, CardContent, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { postToNative } from '@/lib/nativeBridge';
import { SESSION_EXPIRED_KEY, useAuthStore } from '@/store/auth';
import type { AuthLoginResponse } from '@dk/shared/types';

type FormValues = { email: string; password: string };

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  // Read once and cleared, so a later deliberate logout does not inherit it.
  const [expired] = React.useState(() => {
    try {
      const was = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
      if (was) sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      return was;
    } catch {
      return false;
    }
  });
  const login = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (token) navigate('/chat', { replace: true });
  }, [token, navigate]);

  const schema = React.useMemo(
    () =>
      z.object({
        email: z.string().email(t('auth.emailInvalid')),
        password: z.string().min(1, t('auth.passwordRequired')),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const loginMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<AuthLoginResponse>('/v1/auth/login', values),
    onSuccess: (data) => {
      login({ token: data.token, user: data.user });
      // Tell the native shell (if any) to register for push notifications.
      // No-op in a normal browser.
      postToNative({ type: 'auth:login', token: data.token });
      navigate('/chat', { replace: true });
    },
    onError: (err) => {
      // Never leak a raw server/network string — always one warm sentence.
      const msg =
        err instanceof ApiError && err.status === 401
          ? t('auth.loginFailed')
          : t('common.networkError');
      toast.error(msg);
    },
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-1">
          <BrandMark size={48} className="text-text" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-text">
            {t('auth.welcome')}
          </h1>
          <p className="text-sm text-text-muted">{t('auth.subtitle')}</p>
        </div>
        {expired ? (
          // Why they are looking at this screen at all. A dealer session lasts
          // a year and refreshes itself, so this is now almost always the
          // single-active-session rule: somebody signed in on another phone.
          <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-center text-sm text-info">
            {t('chat.sessionExpired')}
          </p>
        ) : null}
        <Card>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => loginMutation.mutate(v))}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="email">
                  {t('auth.email')}
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  invalid={!!errors.email}
                  placeholder={t('auth.emailPlaceholder')}
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-xs text-danger">{errors.email.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="password">
                  {t('auth.password')}
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  invalid={!!errors.password}
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-xs text-danger">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loginMutation.isPending}
              >
                {t('auth.signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-text-subtle">
          {t('auth.needAccess')}
        </p>
      </div>
    </div>
  );
}
