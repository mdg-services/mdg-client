import {
  Globe,
  GraduationCap,
  KeyRound,
  LogOut,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { AppBar } from '@/components/AppBar';
import { LANGUAGE_NAMES, LanguageSheet } from '@/components/LanguageSheet';
import { Avatar, Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import { useGoBack } from '@/lib/useGoBack';
import { useAuthStore } from '@/store/auth';

import { roleLabel } from './settings/RoleBadge';

/**
 * The public video guide.
 *
 * An env override so a preview build can point at a Vercel URL while the
 * `guide.` CNAME is being set up — the same escape hatch the admin portal uses
 * for the same site.
 */
const GUIDE_URL: string = (
  (import.meta.env.VITE_GUIDE_BASE_URL as string | undefined) ??
  'https://guide.mdgservices.in'
).replace(/\/$/, '') + '/';

/**
 * Settings — where everything that is not the chat lives, laid out the way
 * WhatsApp lays out its own: the member's profile first, then one row per thing,
 * each a grey icon, a title and one line saying what is behind it.
 *
 * It is reached from the ⋮ menu on the chat list and nowhere else; there is no
 * bottom bar to put it on. That makes every row here the ONLY door to its
 * screen, so a row that is hidden is a screen the dealer cannot reach — which is
 * why each condition below is the same one the screen behind it enforces (the
 * team is the owner's; warriors belong to an owner or a manager) and no row is
 * hidden for any other reason.
 *
 * THERE IS NO ROW FOR PAPERS, THE DENSITY REGISTER OR PUMP HEALTH. MDG asks for
 * each of those in the chat, on a message with a "Send photo" button, so there
 * is no screen left to point at — the same way the strip under the top bar went.
 *
 * `/profile` mounts this same page, a second route rather than a redirect: a
 * link that is already out there must land here with nothing lost on the way.
 */
export function SettingsPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const goBack = useGoBack('/chat');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [confirmingLogout, setConfirmingLogout] = React.useState(false);
  const closeLanguage = React.useCallback(() => setLanguageOpen(false), []);
  const closeLogout = React.useCallback(() => setConfirmingLogout(false), []);

  const bar = <AppBar title={t('settings.title')} onBack={goBack} />;

  if (!user) {
    return (
      <>
        {bar}
        <EmptyState
          title={t('profile.notSignedIn')}
          description={t('profile.notSignedInDesc')}
        />
      </>
    );
  }

  const isOwner = user.role === 'dealer-owner';
  const canManageStaff = isOwner || user.role === 'dealer-staff';
  // The phone number when there is one, else the email — the line WhatsApp keeps
  // under a member's name.
  const contact = user.phone || user.email;

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {bar}
      <div className="flex flex-1 flex-col bg-wa-bar pb-6">
        <button
          type="button"
          onClick={() => navigate('/settings/profile')}
          className="flex w-full items-center gap-4 border-b border-wa-divider px-4 py-4 text-left active:bg-wa-row-active"
        >
          <Avatar name={user.name} size={64} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[19px] font-medium text-wa-bar-text">
              {user.name}
            </span>
            <span className="block truncate text-[14px] text-wa-meta">
              {roleLabel(user.role, t)}
            </span>
            {contact ? (
              <span className="block truncate text-[14px] text-wa-meta">{contact}</span>
            ) : null}
          </span>
        </button>

        <ul>
          <Row
            icon={KeyRound}
            title={t('settings.account')}
            subtitle={t('settings.accountDesc')}
            onClick={() => navigate('/settings/account')}
          />
          <Row
            icon={Globe}
            title={t('profile.language')}
            subtitle={LANGUAGE_NAMES[lang]}
            onClick={() => setLanguageOpen(true)}
          />
          {isOwner ? (
            <Row
              icon={UsersRound}
              title={t('settings.team')}
              subtitle={t('settings.teamDesc')}
              onClick={() => navigate('/settings/team')}
            />
          ) : null}
          <Row
            icon={Wrench}
            title={t('profile.yourServices')}
            subtitle={t('profile.servicesRowDesc')}
            onClick={() => navigate('/services')}
          />
          {canManageStaff ? (
            <Row
              icon={Users}
              title={t('profile.staffPoints')}
              subtitle={t('profile.staffPointsDesc')}
              onClick={() => navigate('/staff')}
            />
          ) : null}
          {/* The way into the video guide. It carries the dealer's chosen
              language across (`?lang=`), because the guide keeps its own
              preference and would otherwise open in Hindi for someone who has
              just been reading the app in English. `window.open` and not a
              router push: this leaves the app, and inside the native shell the
              nav gate is what hands the URL to Chrome — the same path every
              other outward link here takes. */}
          <Row
            icon={GraduationCap}
            title={t('settings.help')}
            subtitle={t('settings.helpDesc')}
            onClick={() => window.open(`${GUIDE_URL}?lang=${lang}`, '_blank', 'noopener')}
          />
          <Row
            icon={LogOut}
            title={t('settings.logout')}
            danger
            onClick={() => setConfirmingLogout(true)}
          />
        </ul>
      </div>

      {languageOpen ? <LanguageSheet onClose={closeLanguage} /> : null}
      {confirmingLogout ? (
        <LogoutConfirm onCancel={closeLogout} onConfirm={onLogout} />
      ) : null}
    </>
  );
}

/** One line of Settings: a 24px icon, a title, and (usually) one grey line under it. */
function Row({
  icon: Icon,
  title,
  subtitle,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[64px] w-full items-center gap-6 px-5 py-2.5 text-left active:bg-wa-row-active"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center',
            danger ? 'text-danger' : 'text-wa-bar-icon',
          )}
        >
          <Icon width={24} height={24} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[16px]',
              danger ? 'text-danger' : 'text-wa-bar-text',
            )}
          >
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-[14px] text-wa-meta">{subtitle}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * "Log out?" — asked, because signing out of a pump's phone is not something to
 * do with a stray tap: the dealer needs their email and password to come back.
 */
function LogoutConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const panelRef = useDialog(onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label={t('common.cancel')}
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-desc"
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl bg-wa-bar p-6 shadow-lg outline-none animate-in"
      >
        <p id="logout-title" className="text-[18px] font-medium text-wa-bar-text">
          {t('settings.logoutTitle')}
        </p>
        <p id="logout-desc" className="mt-2 text-[15px] text-wa-meta">
          {t('settings.logoutDesc')}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('settings.logout')}
          </Button>
        </div>
      </div>
    </div>
  );
}
