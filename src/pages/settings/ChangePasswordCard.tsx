import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Card, CardContent, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function ChangePasswordCard() {
  const toast = useToast();
  const t = useT();
  const user = useAuthStore((s) => s.user);

  const passwordSchema = React.useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('common.required')),
          newPassword: z.string().min(8, t('profile.min8')),
          confirmPassword: z.string().min(1, t('common.required')),
        })
        .refine((d) => d.newPassword === d.confirmPassword, {
          path: ['confirmPassword'],
          message: t('profile.passwordsDontMatch'),
        }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const mutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.patch<User>(`/v1/dealer-users/${user?.id}`, {
        password: values.newPassword,
        // Actually sent now. The form has always asked for it; until this line
        // it went nowhere, and any text at all changed the password.
        currentPassword: values.currentPassword,
      }),
    onSuccess: () => {
      toast.success(t('profile.passwordChanged'));
      reset();
    },
    onError: (err) => {
      // 401 is the one failure the dealer can do something about.
      const wrongCurrent = err instanceof ApiError && err.status === 401;
      toast.error(
        wrongCurrent
          ? t('profile.currentPasswordWrong')
          : t('profile.passwordChangeFailed'),
      );
    },
  });

  const ids = React.useId();
  if (!user) return null;

  const field = (
    name: keyof PasswordValues,
    labelKey: 'profile.currentPassword' | 'profile.newPassword' | 'profile.confirmPassword',
    autoComplete: 'current-password' | 'new-password',
    hint?: string,
  ) => {
    const error = errors[name]?.message;
    const inputId = `${ids}-${name}`;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-subheading text-text">
          {t(labelKey)}
        </label>
        <Input
          id={inputId}
          type="password"
          autoComplete={autoComplete}
          invalid={!!error}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${inputId}-note` : undefined}
          {...register(name)}
        />
        {error ? (
          <p id={`${inputId}-note`} role="alert" className="break-words text-body text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-note`} className="break-words text-meta text-text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 break-words text-heading text-text">{t('profile.changePassword')}</h2>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-3"
          noValidate
        >
          {field('currentPassword', 'profile.currentPassword', 'current-password')}
          {/* The rule is said BEFORE the first try, not only after it fails. */}
          {field('newPassword', 'profile.newPassword', 'new-password', t('profile.min8'))}
          {field('confirmPassword', 'profile.confirmPassword', 'new-password')}
          <Button type="submit" loading={mutation.isPending} fullWidth>
            {t('profile.updatePassword')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
