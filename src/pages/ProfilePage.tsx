import type { User } from '@dk/shared/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut, UserPlus, Wrench } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

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
import { useAuthStore } from '@/store/auth';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

const inviteSchema = z.object({
  name: z.string().min(1, 'Required').max(120),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
type InviteValues = z.infer<typeof inviteSchema>;

function RoleBadge({ role }: { role: User['role'] }) {
  const label =
    role === 'dealer-owner'
      ? 'Owner'
      : role === 'dealer-staff'
        ? 'Staff'
        : 'Admin';
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: User['status'] }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500',
      )}
      aria-label={status}
    />
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
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
      toast.success('Your password has been changed');
      reset();
    },
    onError: () => {
      toast.error(
        "We couldn't change your password. Please try again, or message us in Chat.",
      );
    },
  });

  if (!user) return null;

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-semibold text-text">Change password</p>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">
              Current password
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
              New password
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
              Confirm new password
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
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TeamSection() {
  const toast = useToast();
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
      toast.success('Done');
    },
    onError: () => {
      toast.error("That didn't work. Please try again, or message us in Chat.");
    },
  });

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
      toast.success('Teammate added');
      reset();
      setInviteOpen(false);
      void qc.invalidateQueries({ queryKey: ['dealer-users', dealerId] });
    },
    onError: () => {
      toast.error(
        "We couldn't add your teammate. Please try again, or message us in Chat.",
      );
    },
  });

  if (forbidden) return null;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-text">Team</p>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<UserPlus width={14} strokeWidth={1.75} />}
            onClick={() => setInviteOpen((v) => !v)}
          >
            Invite
          </Button>
        </div>

        {inviteOpen ? (
          <form
            onSubmit={handleSubmit((v) => invite.mutate(v))}
            className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3"
            noValidate
          >
            <Input
              placeholder="Full name"
              invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name ? (
              <p className="text-xs text-danger">{errors.name.message}</p>
            ) : null}
            <Input
              type="email"
              placeholder="Email"
              invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-danger">{errors.email.message}</p>
            ) : null}
            <Input
              type="password"
              placeholder="Temporary password"
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
                Send invite
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
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
            No teammates yet.
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
                      {member.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
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
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const onSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!user) {
    return (
      <EmptyState
        title="Not signed in"
        description="Please sign in to view your profile."
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
              Your services
            </span>
            <span className="block text-xs text-text-muted">
              See what we run for your pump
            </span>
          </span>
          <ChevronRight
            width={18}
            strokeWidth={1.75}
            className="shrink-0 text-text-subtle"
          />
        </button>
      </Card>

      <ChangePasswordCard />

      {user.role === 'dealer-owner' ? <TeamSection /> : null}

      <Button
        variant="secondary"
        leftIcon={<LogOut width={16} strokeWidth={1.75} />}
        onClick={onSignOut}
        fullWidth
      >
        Sign out
      </Button>
    </div>
  );
}
