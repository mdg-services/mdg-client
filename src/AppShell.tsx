import { FileText, MessageCircle, ShieldCheck, User as UserIcon } from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Avatar, Spinner } from '@/components/ui';
import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import { useRecordsSocket } from '@/features/records/useRecordsSocket';
import { useMe } from '@/hooks/api/useMe';
import { useDeliveryAck } from '@/hooks/useDeliveryAck';
import { usePushBridge } from '@/hooks/usePushBridge';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';

/**
 * The authenticated app frame: header, bottom tab bar, and the app-wide realtime
 * hooks. It is a separate route-level chunk (lazy-loaded in App.tsx via a layout
 * route) for two reasons:
 *
 *  1. The socket.io / realtime stack and these hooks never ship in the
 *     unauthenticated login chunk — a low-bandwidth dealer who only ever sees the
 *     login screen downloads none of it.
 *  2. Mounted ONCE by the layout route, so switching tabs swaps only the
 *     <Outlet/> content instead of unmounting/remounting the shell — useMe no
 *     longer refetches and the socket does not re-subscribe on every tab tap.
 */
export function AppShell() {
  useMe(); // refresh /me when authed
  useRecordsSocket(); // refresh Reports + toast on record:new
  useConversationsListSocket(); // keep the chat LIST + unread badges live app-wide
  useDeliveryAck(); // ack message delivery (✓✓) app-wide, even off the chat screen
  usePushBridge(); // register push token + handle deep links from native
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const setLangFromUser = useLangStore((s) => s.setLangFromUser);

  // A returning member lands in their saved language (unless they've already
  // made an explicit local pick). Guarded inside the store, so this is idempotent.
  React.useEffect(() => {
    if (user) setLangFromUser(user);
  }, [user, setLangFromUser]);

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand text-text-inverse text-xs font-semibold">
              MDG
            </div>
            <span className="truncate text-sm font-semibold tracking-tight text-text">
              {t('app.brand')}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle compact />
            <Avatar name={user?.name} size={32} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-20">
        {/* The shell stays painted while the next page's chunk streams in. */}
        <React.Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center py-20">
              <Spinner size={22} />
            </div>
          }
        >
          <Outlet />
        </React.Suspense>
      </main>

      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface',
          'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 pt-1">
          <TabLink to="/chat" icon={<MessageCircle width={22} strokeWidth={1.75} />} label={t('nav.chat')} />
          <TabLink to="/records" icon={<FileText width={22} strokeWidth={1.75} />} label={t('nav.reports')} />
          <TabLink
            to="/kavach"
            icon={<ShieldCheck width={22} strokeWidth={1.75} />}
            label={t('nav.kavach')}
          />
          <TabLink to="/profile" icon={<UserIcon width={22} strokeWidth={1.75} />} label={t('nav.profile')} />
        </div>
      </nav>
    </div>
  );
}

function TabLink({
  to,
  icon,
  label,
  sublabel,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors',
          isActive ? 'text-text' : 'text-text-subtle hover:text-text-muted',
        )
      }
    >
      {icon}
      <span className="leading-none">{label}</span>
      {sublabel ? (
        <span className="text-[10px] leading-none">{sublabel}</span>
      ) : null}
    </NavLink>
  );
}
