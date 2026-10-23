import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Avatar,
  Button,
  Card,
  CardContent,
  Input,
  Spinner,
  useToast,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

import { RoleBadge, StatusDot } from './RoleBadge';

type InviteValues = { name: string; mobile: string; email: string; password: string };

/** "+91 98765 43210" → "9876543210": the sign-in name the server matches on. */
function tenDigits(mobile: string): string {
  return mobile.replace(/\D/g, '').slice(-10);
}

export function TeamSection() {
  const toast = useToast();
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId;
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [forbidden, setForbidden] = React.useState(false);

  const teamQuery = useQuery<User[]>({
    queryKey: ['dealer-users', dealerId],
    enabled: !!dealerId,
    queryFn: async () => {
      try {
        return await api.get<User[]>(`/v1/dealers/${dealerId}/users`);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setForbidden(true);
          return [];
        }
        throw err;
      }
    },
  });

  const toggle = useMutation({
    mutationFn: (target: User) =>
      api.patch<User>(`/v1/dealer-users/${target.id}`, {
        status: target.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealer-users', dealerId] });
      toast.success(t('common.done'));
    },
    onError: () => {
      toast.error(t('profile.actionFailed'));
    },
  });

  const inviteSchema = React.useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('common.required')).max(120),
        // The manager signs in with this number (onboarding v2); an email is optional.
        mobile: z
          .string()
          .refine((v) => /^[6-9]\d{9}$/.test(tenDigits(v)), t('register.mobileInvalid')),
        email: z.union([z.literal(''), z.string().trim().email(t('auth.emailInvalid'))]),
        password: z.string().min(8, t('profile.min8')),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema) });

  const invite = useMutation({
    mutationFn: (values: InviteValues) =>
      api.post<User>('/v1/dealer-users', {
        dealerId,
        phone: tenDigits(values.mobile),
        ...(values.email.trim() ? { email: values.email.trim() } : {}),
        name: values.name,
        role: 'dealer-staff',
        password: values.password,
      }),
    onSuccess: () => {
      toast.success(t('profile.teammateAdded'));
      reset();
      setInviteOpen(false);
      void qc.invalidateQueries({ queryKey: ['dealer-users', dealerId] });
    },
    onError: (err) => {
      // The two refusals an owner can act on get their own words; anything else
      // stays the general line.
      const msg = err instanceof ApiError ? err.message : '';
      if (err instanceof ApiError && err.status === 409 && /manager/i.test(msg)) {
        toast.error(t('profile.teamHasManager'));
      } else if (err instanceof ApiError && err.status === 409 && /email/i.test(msg)) {
        toast.error(t('profile.emailInUse'));
      } else {
        toast.error(t('profile.teammateAddFailed'));
      }
    },
  });

  if (forbidden) return null;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-text">{t('profile.team')}</p>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<UserPlus width={14} strokeWidth={1.75} />}
            onClick={() => setInviteOpen((v) => !v)}
          >
            {t('profile.invite')}
          </Button>
        </div>

        {inviteOpen ? (
          <form
            onSubmit={handleSubmit((v) => invite.mutate(v))}
            className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3"
            noValidate
          >
            <Input
              placeholder={t('profile.fullName')}
              autoCapitalize="words"
              autoComplete="off"
              spellCheck={false}
              invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name ? (
              <p className="text-xs text-danger">{errors.name.message}</p>
            ) : null}
            <Input
              type="tel"
              placeholder={t('profile.managerMobile')}
              inputMode="numeric"
              autoComplete="off"
              invalid={!!errors.mobile}
              {...register('mobile')}
            />
            {errors.mobile ? (
              <p className="text-xs text-danger">{errors.mobile.message}</p>
            ) : null}
            <Input
              type="email"
              placeholder={t('profile.emailOptional')}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-danger">{errors.email.message}</p>
            ) : null}
            <Input
              type="password"
              placeholder={t('profile.tempPassword')}
              // Teammate's temp password — signal a NEW credential so the OS
              // manager doesn't autofill the owner's own login here.
              autoComplete="new-password"
              invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-danger">{errors.password.message}</p>
            ) : (
              <p className="text-xs text-text-subtle">{t('profile.tempPasswordNote')}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                loading={invite.isPending}
                fullWidth
              >
                {t('profile.sendInvite')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setInviteOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : null}

        {teamQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner size={16} />
          </div>
        ) : teamQuery.isError ? (
          // NOT "No teammates yet". That is a confident statement about the
          // dealer's own staff, and a wrong one when the request simply failed —
          // the obvious next move is to invite the manager again, which then
          // fails on a duplicate email.
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-center text-xs text-text-subtle">
              {t('common.loadFailed')}
            </p>
            <button
              type="button"
              onClick={() => void teamQuery.refetch()}
              className="rounded-full border border-border px-3 py-1 text-xs text-text-muted active:bg-surface-2"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : !teamQuery.data || teamQuery.data.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-subtle">
            {t('profile.noTeammates')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {teamQuery.data.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 py-2.5"
              >
                <Avatar name={member.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-text">
                      {member.name}
                    </p>
                    <StatusDot status={member.status} />
                  </div>
                  <p className="truncate text-xs text-text-muted">
                    {member.email || member.phone}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RoleBadge role={member.role} />
                  {/* Only the MANAGER can be paused from here: a co-owner is
                      MDG's to change, and the server refuses it. */}
                  {member.id !== user?.id && member.role === 'dealer-staff' ? (
                    <button
                      type="button"
                      onClick={() => toggle.mutate(member)}
                      className="text-[11px] font-medium text-text-muted underline-offset-2 hover:underline"
                    >
                      {member.status === 'ACTIVE'
                        ? t('profile.suspend')
                        : t('profile.activate')}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
