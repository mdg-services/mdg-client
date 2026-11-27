import { MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { SubPageBar } from '@/components/SubPage';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

import { MemberStatus, roleLabel } from './RoleBadge';

/**
 * Settings, the profile row: who this login is.
 *
 * READ-ONLY, and the page says so rather than showing fields that look editable: an owner cannot
 * change their own name, email or phone from the app (the account is MDG's record of who runs the
 * pump), so the one thing on offer is the way to ask: a message to the MDG team.
 */
export function SettingsProfilePage() {
  const t = useT();
  const openMyChat = useOpenMyChat();
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <>
        <SubPageBar title={t('settings.profileTitle')} />
        <EmptyState title={t('profile.notSignedIn')} description={t('profile.notSignedInDesc')} />
      </>
    );
  }

  return (
    <>
      <SubPageBar title={t('settings.profileTitle')} />
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
        <div className="flex justify-center py-2">
          <Avatar name={user.name} size={96} />
        </div>

        <Card className="px-4">
          <dl className="divide-y divide-border">
            <Field label={t('settings.fieldName')} value={user.name} />
            <Field label={t('settings.fieldRole')} value={roleLabel(user.role, t)} />
            {/* A dealer who registered with a mobile number only has no email: say so
                instead of leaving a blank. */}
            <Field label={t('auth.email')} value={user.email || t('settings.notAdded')} />
            <Field label={t('settings.fieldPhone')} value={user.phone || t('settings.notAdded')} />
            <Field label={t('settings.fieldStatus')} value={<MemberStatus user={user} self />} />
          </dl>
        </Card>

        <p className="break-words text-body text-text-muted">{t('settings.profileHint')}</p>
        <Button
          variant="secondary"
          onClick={openMyChat}
          leftIcon={<MessageCircle aria-hidden className="h-5 w-5" strokeWidth={1.75} />}
          className="self-start"
        >
          {t('settings.messageUs')}
        </Button>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-meta text-text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-body text-text">{value}</dd>
    </div>
  );
}
