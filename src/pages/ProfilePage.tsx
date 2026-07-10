import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut, Users, UserPlus, Wrench } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';


import { LanguageToggle } from '@/components/LanguageToggle';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Spinner,
  useToast,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type InviteValues = { name: string; email: string; password: string };

function RoleBadge({ role }: { role: User['role'] }) {
  const t = useT();
  const label =
    role === 'dealer-owner'
      ? t('profile.roleOwner')
      : role === 'dealer-staff'
        ? t('profile.roleStaff')
        : t('profile.roleAdmin');
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: User['status'] }) {
  const t = useT();
  const active = status === 'ACTIVE';
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        active ? 'bg-emerald-500' : 'bg-amber-500',
      )}
      aria-label={active ? t('profile.statusActive') : t('profile.statusPaused')}
    />
  );
}

function ChangePasswordCard() {
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
      }),
    onSuccess: () => {
      toast.success(t('profile.passwordChanged'));
      reset();
    },
    onError: () => {
      toast.error(t('profile.passwordChangeFailed'));
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

function TeamSection() {
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
        email: z.string().email(t('auth.emailInvalid')),
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
        email: values.email,
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
    onError: () => {
      toast.error(t('profile.teammateAddFailed'));
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
              type="email"
              placeholder={t('auth.email')}
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
            ) : null}
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
                    {member.email}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RoleBadge role={member.role} />
                  {member.id !== user?.id ? (
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

export function ProfilePage() {
  const navigate = useNavigate();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const onSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const canManageStaff =
    user?.role === 'dealer-owner' || user?.role === 'dealer-staff';

  if (!user) {
    return (
      <EmptyState
        title={t('profile.notSignedIn')}
        description={t('profile.notSignedInDesc')}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <Card>
        <CardContent>
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-text">
                {user.name}
              </p>
              <p className="truncate text-xs text-text-muted">{user.email}</p>
              <div className="mt-1.5">
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => navigate('/services')}
          className="flex w-full items-center gap-3 p-5 text-left active:bg-surface-2"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-muted">
            <Wrench width={18} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">
              {t('profile.yourServices')}
            </span>
            <span className="block text-xs text-text-muted">
              {t('profile.servicesRowDesc')}
            </span>
          </span>
          <ChevronRight
            width={18}
            strokeWidth={1.75}
            className="shrink-0 text-text-subtle"
          />
        </button>
      </Card>

      {canManageStaff ? (
        <Card>
          <button
            type="button"
            onClick={() => navigate('/staff')}
            className="flex w-full items-center gap-3 p-5 text-left active:bg-surface-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-muted">
              <Users width={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">
                {t('profile.staffPoints')}
              </span>
              <span className="block text-xs text-text-muted">
                {t('profile.staffPointsDesc')}
              </span>
            </span>
            <ChevronRight
              width={18}
              strokeWidth={1.75}
              className="shrink-0 text-text-subtle"
            />
          </button>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                {t('profile.language')}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {t('profile.languageDesc')}
              </p>
            </div>
            <LanguageToggle />
          </div>
        </CardContent>
      </Card>

      <ChangePasswordCard />

      {user.role === 'dealer-owner' ? <TeamSection /> : null}

      <Button
        variant="secondary"
        leftIcon={<LogOut width={16} strokeWidth={1.75} />}
        onClick={onSignOut}
        fullWidth
      >
        {t('profile.signOut')}
      </Button>
    </div>
  );
}
