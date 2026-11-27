import { Compass, FileText, Fuel, Globe, KeyRound, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { InsightRow } from '@/components/kit/InsightRow';
import { PageHeader } from '@/components/kit/PageHeader';
import { SectionCard } from '@/components/kit/SectionCard';
import type { Status } from '@/components/kit/types';
import { LANGUAGE_NAMES, LanguageSheet } from '@/components/LanguageSheet';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { isPlannerUser } from '@/features/planner/isPlanner';
import { planSummary } from '@/features/planner/planView';
import { usePlannerView } from '@/features/planner/usePlanner';
import { NavRow } from '@/features/pump/PumpRows';
import { BatteryGuideSheet, batteryGuideMaker } from '@/features/push/BatteryGuide';
import { requestPushPermission } from '@/hooks/usePushBridge';
import { cn } from '@/lib/cn';
import { isEmbedded } from '@/lib/embedMode';
import { useLang, useT } from '@/lib/i18n';
import { PRIVACY_URL, TERMS_URL, openWebPage } from '@/lib/legalLinks';
import { isNativeShell, openNativeAppSettings } from '@/lib/nativeBridge';
import { useDialog } from '@/lib/useDialog';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import { usePushStore } from '@/store/push';
import { ACCOUNT_WIPE_AFTER_DAYS } from '@dk/shared';

import { roleLabel } from './settings/RoleBadge';

/**
 * Someone planning a pump (ADR 0058) has no outlet: their Kavach Shuruaat row says where the plan
 * stands. It is its own component so that the one server request it needs is made only for them;
 * every other sign-in still makes none on this page.
 */
function PlannerRow({ icon }: { icon: string }) {
  const t = useT();
  const navigate = useNavigate();
  const planView = usePlannerView();
  const planState = planView.data ? planSummary(planView.data).state : null;
  return (
    <NavRow
      leading={<Compass aria-hidden className={icon} strokeWidth={1.75} />}
      title={t('planner.settingsRow')}
      subtitle={planState ? t(`planner.state.${planState}`) : undefined}
      onPress={() => navigate('/settings/new-pump-guide')}
    />
  );
}

/**
 * Settings, the quiet phone page (spec 4.5): what belongs to THIS PHONE and THIS PERSON, and nothing
 * about the pump's business (that is My pump, `/pump`). Your name and mobile, the language, whether
 * MDG's messages reach you, the password, the legal pages, log out, and, apart at the bottom, delete
 * account. Inside the extension's side panel, which has no bar and no "My pump" button, there is also
 * one row to My pump.
 *
 * IT MAKES NO SERVER REQUEST, and a test pins that: everything here is read from the sign-in already
 * on the phone (the name, the role, the mobile) and from the phone itself (notifications, the battery
 * saver). That is why it does not ask which pumps the person has: "Switch pump" lives on My pump.
 *
 * Delete account stays reachable inside the app (Apple's rule) and stays at its old address, the
 * Account page; here it is set apart under its own heading so it is never a stray tap. "Messages
 * reaching me" is always there: on the phone it says whether notifications are on, in a browser it
 * says where messages arrive.
 *
 * `/profile` mounts this same page, a second route rather than a redirect: a link that is already out
 * there must land here with nothing lost on the way. Opened cold (a notification) there is nothing
 * behind it: the arrow goes home, to Today, and from the extension's panel, which has no Today, to its chat.
 */
export function SettingsPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const embedded = isEmbedded();
  const large = useLargeText();
  const deleteHeadingId = React.useId();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [confirmingLogout, setConfirmingLogout] = React.useState(false);
  const closeLanguage = React.useCallback(() => setLanguageOpen(false), []);
  const closeLogout = React.useCallback(() => setConfirmingLogout(false), []);
  // ── messages reaching me ── read from the phone only
  const pushState = usePushStore((s) => s.pushState);
  const canAskAgain = usePushStore((s) => s.canAskAgain);
  const native = isNativeShell();
  const showMessages = native && pushState !== 'unavailable';
  // Phones whose battery saver hides notifications get the steps here too (ADR 0040 section 7).
  const showBatteryGuide = showMessages && batteryGuideMaker() !== null;
  const [batteryOpen, setBatteryOpen] = React.useState(false);
  const closeBattery = React.useCallback(() => setBatteryOpen(false), []);

  const bar = <PageHeader variant="sub" title={t('settings.title')} back={{ to: embedded ? '/chat' : '/' }} />;

  if (!user) {
    return (
      <>
        {bar}
        <EmptyState title={t('profile.notSignedIn')} description={t('profile.notSignedInDesc')} />
      </>
    );
  }

  // The mobile number when there is one (it is what a pump owner knows himself by), else the email.
  // An email is one long word, so it alone may break anywhere when the line is too narrow.
  const contact = user.phone || user.email;
  const contactIsEmail = !user.phone && !!user.email;

  // Granted, or refused for good, the only door left is the phone's Settings. Never asked, or refused
  // with the phone still willing, the phone itself can be made to ask. An `unknown` state (an older
  // shell that never said) reads the same as "not yet", because asking again is harmless.
  const messagesOn = pushState === 'on';
  const messagesOff = pushState === 'off';
  const onMessages = () => {
    if (messagesOn || (messagesOff && !canAskAgain)) openNativeAppSettings();
    else requestPushPermission();
  };
  // A phone that hides messages to save battery is a thing to know, not a fault of the owner's:
  // so it reads as a plain fact, and only a switched-off notification needs a look.
  const messagesStatus: Status = messagesOn ? (showBatteryGuide ? 'info' : 'ok') : 'attention';
  const messagesText = messagesOn
    ? t('pump.settings.messages.on')
    : messagesOff
      ? t('pump.settings.messages.off')
      : t('pump.settings.messages.ask');

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const icon = 'h-5 w-5 text-text-muted';

  return (
    <>
      {bar}
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
        <Card>
          <button
            type="button"
            onClick={() => navigate('/settings/profile')}
            className="flex min-h-14 w-full flex-col gap-2 rounded-xl p-4 text-left active:bg-surface-2"
          >
            <span className="flex w-full items-center gap-4">
              <Avatar name={user.name} size={large ? 40 : 56} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="break-words text-heading text-text">{user.name}</span>
                <span className="break-words text-body text-text-muted">{roleLabel(user.role, t)}</span>
              </span>
            </span>
            {/* On its own line, under both, so it has the card's whole width: beside the picture an
                email broke in the middle of the address at 200% text. */}
            {contact ? (
              <span className={cn('w-full text-body text-text-muted', contactIsEmail ? 'break-all' : 'break-words')}>
                {contact}
              </span>
            ) : null}
          </button>
        </Card>

        <Card className="px-4">
          <div className="divide-y divide-border">
            {embedded ? (
              <NavRow
                leading={<Fuel aria-hidden className={icon} strokeWidth={1.75} />}
                title={t('pump.settings.pumpRow')}
                subtitle={t('pump.settings.pumpRowDesc')}
                onPress={() => navigate('/pump')}
              />
            ) : null}
            {isPlannerUser(user) ? <PlannerRow icon={icon} /> : null}
            <NavRow
              leading={<Globe aria-hidden className={icon} strokeWidth={1.75} />}
              title={t('profile.language')}
              subtitle={LANGUAGE_NAMES[lang]}
              onPress={() => setLanguageOpen(true)}
            />
            <NavRow
              leading={<KeyRound aria-hidden className={icon} strokeWidth={1.75} />}
              title={t('profile.changePassword')}
              subtitle={t('pump.settings.passwordDesc')}
              onPress={() => navigate('/settings/account')}
            />
          </div>
        </Card>

        {showMessages ? (
          <SectionCard title={t('pump.settings.messages.title')}>
            <InsightRow
              status={messagesStatus}
              text={messagesText}
              {...(messagesOn && showBatteryGuide ? { meta: t('pump.settings.messages.battery') } : {})}
              onPress={onMessages}
              {...(showBatteryGuide
                ? { action: { label: t('pump.settings.messages.batteryAction'), onPress: () => setBatteryOpen(true) } }
                : {})}
            />
          </SectionCard>
        ) : !native ? (
          // In a browser or the side panel there is no phone to ask: the row still says where messages arrive.
          <SectionCard title={t('pump.settings.messages.title')}>
            <InsightRow status="info" text={t('pump.settings.messages.web')} />
          </SectionCard>
        ) : null}

        <Card className="px-4">
          <div className="divide-y divide-border">
            <NavRow
              leading={<ShieldCheck aria-hidden className={icon} strokeWidth={1.75} />}
              title={t('legal.privacyPolicy')}
              onPress={() => openWebPage(PRIVACY_URL)}
            />
            <NavRow
              leading={<FileText aria-hidden className={icon} strokeWidth={1.75} />}
              title={t('legal.termsOfService')}
              onPress={() => openWebPage(TERMS_URL)}
            />
          </div>
        </Card>

        <Button variant="secondary" fullWidth onClick={() => setConfirmingLogout(true)} className="text-danger">
          {t('settings.logout')}
        </Button>

        {/* Apart from everything else, at the bottom: it cannot be undone from the app. Same address as
            before (the Account page), and still here for the store's rule that it is reachable. */}
        {user.role !== 'admin' ? (
          <section aria-labelledby={deleteHeadingId} className="mt-4 flex flex-col gap-2">
            <h2 id={deleteHeadingId} className="break-words text-heading text-text">
              {t('pump.settings.danger')}
            </h2>
            <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-surface p-4">
              <p className="break-words text-body text-text-muted">
                {t('account.deleteDesc', { days: ACCOUNT_WIPE_AFTER_DAYS })}
              </p>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate('/settings/account', { state: { section: 'delete' } })}
                className="border-danger/40 text-danger"
              >
                {t('account.delete')}
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      {languageOpen ? <LanguageSheet onClose={closeLanguage} /> : null}
      {batteryOpen ? <BatteryGuideSheet onClose={closeBattery} /> : null}
      {confirmingLogout ? <LogoutConfirm onCancel={closeLogout} onConfirm={onLogout} /> : null}
    </>
  );
}

/**
 * "Log out?": asked, because signing out of a pump's phone is not something to do with a stray tap: the
 * owner needs the email and password to come back.
 */
function LogoutConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  const panelRef = useDialog(onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
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
        className="animate-in relative w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-lg outline-none"
      >
        <p id="logout-title" className="break-words text-heading text-text">
          {t('settings.logoutTitle')}
        </p>
        <p id="logout-desc" className="mt-2 break-words text-body text-text-muted">
          {t('settings.logoutDesc')}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
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
