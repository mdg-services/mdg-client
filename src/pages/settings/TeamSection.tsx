import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ErrorCard } from '@/components/kit/ErrorCard';
import { PillGroup } from '@/components/kit/PillGroup';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { Avatar, Button, Card, CardContent, Input, useToast } from '@/components/ui';
import { teamKey, useTeamUsers } from '@/features/pump/usePumpData';
import { toMobile } from '@/features/register/enroll';
import { ApiError, api } from '@/lib/api';
import { fmtDay } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

import { MemberStatus, RoleBadge } from './RoleBadge';

type InviteValues = { name: string; mobile: string; email: string; password: string };
/** Who the invite is for: a manager (a pump may have several), or a partner who is another owner. */
type InviteRole = 'dealer-staff' | 'dealer-owner';


export function TeamSection() {
  const toast = useToast();
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId;
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteRole, setInviteRole] = React.useState<InviteRole>('dealer-staff');
  const partner = inviteRole === 'dealer-owner';
  const ids = React.useId();

  // One list for this card and for My pump's team line. A 403 or 404 is "not yours to see": `null`.
  const teamQuery = useTeamUsers(true);
  const forbidden = teamQuery.data === null;

  const toggle = useMutation({
    mutationFn: (target: User) =>
      api.patch<User>(`/v1/dealer-users/${target.id}`, {
        status: target.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamKey(dealerId) });
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
        // The manager or partner signs in with this number (onboarding v2); an email is optional.
        mobile: z
          .string()
          // The sign-in screen's own rule (`toMobile`): an extra digit or a letter is a typo
          // to fix, never a different number to send.
          .refine((v) => toMobile(v) !== null, t('register.mobileInvalid')),
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
        // "+91 98765 43210" → "9876543210": the sign-in name the server matches on.
        phone: toMobile(values.mobile) ?? values.mobile,
        ...(values.email.trim() ? { email: values.email.trim() } : {}),
        name: values.name,
        role: inviteRole,
        password: values.password,
      }),
    onSuccess: () => {
      toast.success(t(partner ? 'profile.partnerAdded' : 'profile.teammateAdded'));
      reset();
      setInviteOpen(false);
      void qc.invalidateQueries({ queryKey: teamKey(dealerId) });
    },
    onError: (err) => {
      // The refusals an owner can act on get their own words; anything else
      // stays the general line. (A pump may have several managers, so a second
      // manager is never refused.)
      const msg = err instanceof ApiError ? err.message : '';
      if (err instanceof ApiError && err.status === 409 && /already has a Dealer Kavach login/i.test(msg)) {
        toast.error(t('profile.numberHasLogin'));
      } else if (err instanceof ApiError && err.status === 409 && /owners/i.test(msg)) {
        toast.error(t('profile.tooManyOwners'));
      } else if (err instanceof ApiError && err.status === 409 && /email/i.test(msg)) {
        toast.error(t('profile.emailInUse'));
      } else {
        toast.error(t('profile.teammateAddFailed'));
      }
    },
  });

  if (forbidden) return null;

  const fieldError = (id: string, message: string | undefined) =>
    message ? (
      <p id={`${id}-note`} role="alert" className="break-words text-body text-danger">
        {message}
      </p>
    ) : null;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="min-w-0 break-words text-heading text-text">{t('profile.team')}</h2>
          <Button
            variant="secondary"
            leftIcon={<UserPlus aria-hidden className="h-5 w-5" strokeWidth={1.75} />}
            aria-expanded={inviteOpen}
            onClick={() => setInviteOpen((v) => !v)}
          >
            {t('profile.invite')}
          </Button>
        </div>

        {inviteOpen ? (
          <form
            onSubmit={handleSubmit((v) => invite.mutate(v))}
            className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-3"
            noValidate
          >
            <PillGroup
              label={t('profile.invite')}
              value={inviteRole}
              onChange={setInviteRole}
              options={[
                { id: 'dealer-staff', label: t('profile.inviteManager') },
                { id: 'dealer-owner', label: t('profile.invitePartner') },
              ]}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-name`} className="text-subheading text-text">
                {t('profile.fullName')}
              </label>
              <Input
                id={`${ids}-name`}
                autoCapitalize="words"
                autoComplete="off"
                spellCheck={false}
                invalid={!!errors.name}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? `${ids}-name-note` : undefined}
                {...register('name')}
              />
              {fieldError(`${ids}-name`, errors.name?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-mobile`} className="text-subheading text-text">
                {t(partner ? 'profile.partnerMobile' : 'profile.managerMobile')}
              </label>
              <Input
                id={`${ids}-mobile`}
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                invalid={!!errors.mobile}
                aria-invalid={!!errors.mobile}
                aria-describedby={errors.mobile ? `${ids}-mobile-note` : undefined}
                {...register('mobile')}
              />
              {fieldError(`${ids}-mobile`, errors.mobile?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-email`} className="text-subheading text-text">
                {t('profile.emailOptional')}
              </label>
              <Input
                id={`${ids}-email`}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                invalid={!!errors.email}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? `${ids}-email-note` : undefined}
                {...register('email')}
              />
              {fieldError(`${ids}-email`, errors.email?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-password`} className="text-subheading text-text">
                {t('profile.tempPassword')}
              </label>
              <Input
                id={`${ids}-password`}
                type="password"
                // Teammate's temp password: signal a NEW credential so the OS
                // manager doesn't autofill the owner's own login here.
                autoComplete="new-password"
                invalid={!!errors.password}
                aria-invalid={!!errors.password}
                aria-describedby={`${ids}-password-note`}
                {...register('password')}
              />
              {errors.password ? (
                fieldError(`${ids}-password`, errors.password.message)
              ) : (
                <p id={`${ids}-password-note`} className="break-words text-meta text-text-muted">
                  {t(partner ? 'profile.partnerNote' : 'profile.tempPasswordNote')}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={invite.isPending} className="min-w-0 flex-1">
                {t('profile.sendInvite')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : null}

        {teamQuery.isPending && teamQuery.fetchStatus !== 'paused' ? (
          <SkeletonBlock lines={3} />
        ) : teamQuery.isError || !teamQuery.data ? (
          // NOT "No teammates yet". That is a confident statement about the
          // dealer's own staff, and a wrong one when the request simply failed:
          // the obvious next move is to invite the manager again, which then
          // fails on a duplicate email.
          <ErrorCard text={t('common.loadFailed')} onRetry={() => void teamQuery.refetch()} />
        ) : teamQuery.data.length === 0 ? (
          <p className="break-words py-4 text-center text-body text-text-muted">{t('profile.noTeammates')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {teamQuery.data.map((member) => (
              <li key={member.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start gap-3">
                  <Avatar name={member.name} size={44} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="break-words text-body font-medium text-text">{member.name}</p>
                    <p className="break-words text-meta text-text-muted">{member.email || member.phone}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleBadge role={member.role} />
                      <MemberStatus user={member} self={member.id === user?.id} />
                    </div>
                    {member.lastLoginAt ? (
                      <p className="break-words text-meta text-text-muted">
                        {t('pump.team.lastOpened', { day: fmtDay(member.lastLoginAt, lang) })}
                      </p>
                    ) : null}
                  </div>
                </div>
                {/* Only the MANAGER can be paused from here: a co-owner is
                    MDG's to change, and the server refuses it. */}
                {member.id !== user?.id && member.role === 'dealer-staff' ? (
                  <Button
                    variant="secondary"
                    onClick={() => toggle.mutate(member)}
                    disabled={toggle.isPending}
                    aria-label={t(member.status === 'ACTIVE' ? 'pump.team.suspendName' : 'pump.team.activateName', {
                      name: member.name,
                    })}
                    className="self-start"
                  >
                    {member.status === 'ACTIVE' ? t('profile.suspend') : t('profile.activate')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
