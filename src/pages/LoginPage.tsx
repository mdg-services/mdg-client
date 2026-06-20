import type { AuthLoginResponse } from '@dk/shared/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button, Card, CardContent, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { postToNative } from '@/lib/nativeBridge';
import { useAuthStore } from '@/store/auth';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const login = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (token) navigate('/chat', { replace: true });
  }, [token, navigate]);

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
      const msg =
        err instanceof ApiError && err.status === 401
          ? "That email or password didn't work. Try again or contact support."
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
      toast.error(msg);
    },
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-text-inverse text-lg font-semibold tracking-tight">
            MDG
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-text">
            Welcome back
          </h1>
          <p className="text-sm text-text-muted">
            Sign in to chat with the MDG team.
          </p>
        </div>
        <Card>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => loginMutation.mutate(v))}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  invalid={!!errors.email}
                  placeholder="you@dealership.com"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-xs text-danger">{errors.email.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="password">
                  Password
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
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-text-subtle">
          Need access? Contact your MDG account manager.
        </p>
      </div>
    </div>
  );
}
