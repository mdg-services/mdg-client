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

  if (!user) return null;

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-semibold text-text">
          {t('profile.changePassword')}
        </p>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">
              {t('profile.currentPassword')}
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              invalid={!!errors.currentPassword}
              {...register('currentPassword')}
            />
            {errors.currentPassword ? (
              <p className="text-xs text-danger">
                {errors.currentPassword.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">
              {t('profile.newPassword')}
            </label>
            <Input
              type="password"
              autoComplete="new-password"
              invalid={!!errors.newPassword}
              {...register('newPassword')}
            />
            {errors.newPassword ? (
              <p className="text-xs text-danger">{errors.newPassword.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">
              {t('profile.confirmPassword')}
            </label>
            <Input
              type="password"
              autoComplete="new-password"
              invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword ? (
              <p className="text-xs text-danger">
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" loading={mutation.isPending} fullWidth>
            {t('profile.updatePassword')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
