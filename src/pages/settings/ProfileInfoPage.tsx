import { MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { SubPageBar } from '@/components/SubPage';
import { Avatar, EmptyState } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

import { StatusDot, roleLabel } from './RoleBadge';

/**
 * Settings → the profile row: who this login is, in the big-avatar layout
 * WhatsApp gives its own profile screen.
 *
 * READ-ONLY, and the page says so rather than showing fields that look
 * editable: a dealer cannot change their own name, email or phone from the app
 * (the account is MDG's record of who runs the pump), so the one thing on offer
 * is the way to ask — a message to the MDG team.
 */
export function SettingsProfilePage() {
  const t = useT();
  const openMyChat = useOpenMyChat();
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <>
        <SubPageBar title={t('settings.profileTitle')} />
        <EmptyState
          title={t('profile.notSignedIn')}
          description={t('profile.notSignedInDesc')}
        />
      </>
    );
  }

  return (
    <>
      <SubPageBar title={t('settings.profileTitle')} />
      <div className="flex flex-1 flex-col bg-wa-bar pb-6">
        <div className="flex justify-center px-4 pb-6 pt-8">
          <Avatar name={user.name} size={112} />
        </div>

        <dl className="divide-y divide-wa-divider border-y border-wa-divider">
          <Field label={t('settings.fieldName')} value={user.name} />
          <Field label={t('settings.fieldRole')} value={roleLabel(user.role, t)} />
          {/* A dealer who registered with a mobile number only has no email: say so
              instead of leaving a blank. */}
          <Field label={t('auth.email')} value={user.email || t('settings.notAdded')} />
          <Field label={t('settings.fieldPhone')} value={user.phone || t('settings.notAdded')} />
          <Field
            label={t('settings.fieldStatus')}
            value={
              <span className="inline-flex items-center gap-2">
                <StatusDot status={user.status} />
                {user.status === 'ACTIVE' ? t('profile.statusActive') : t('profile.statusPaused')}
              </span>
            }
          />
        </dl>

        <p className="px-5 pt-5 text-[14px] text-wa-meta">{t('settings.profileHint')}</p>
        <button
          type="button"
          onClick={openMyChat}
          className="mx-5 mt-3 flex h-11 items-center gap-2 self-start rounded-full border border-wa-divider px-4 text-[15px] font-medium text-wa-accent-strong active:bg-wa-row-active"
        >
          <MessageCircle width={18} strokeWidth={1.75} />
          {t('kavach.messageUs')}
        </button>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-[13px] text-wa-meta">{label}</dt>
      <dd className="mt-0.5 break-words text-[16px] text-wa-bar-text">{value}</dd>
    </div>
  );
}
