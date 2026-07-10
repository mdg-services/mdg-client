import { FileText, MessageCircle, ShieldCheck, User as UserIcon } from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet, useMatch } from 'react-router-dom';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Avatar, Spinner } from '@/components/ui';
import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import { useRecordsSocket } from '@/features/records/useRecordsSocket';
import { useMe } from '@/hooks/api/useMe';
import { useDeliveryAck } from '@/hooks/useDeliveryAck';
import { usePushBridge } from '@/hooks/usePushBridge';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useKeyboardViewport } from '@/lib/useKeyboardViewport';
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
  const { keyboardOpen } = useKeyboardViewport(); // track keyboard/visual viewport
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const setLangFromUser = useLangStore((s) => s.setLangFromUser);

  // An open conversation (/chat/:id) is a full-height messaging screen with its
  // own composer pinned to the bottom. On that route we bind the frame to the
  // *visible* viewport height so the composer stays above the keyboard even on
  // devices/keyboards where the native window doesn't resize (many tablets,
  // split/floating keyboards). Height resolves in order of reliability:
  //   1. --vvh   — JS-measured visual-viewport height (covers iOS Safari / any
  //                WebView that doesn't honour interactive-widget).
  //   2. 100dvh  — the dynamic viewport unit. With `interactive-widget=
  //                resizes-content` (see index.html) the keyboard shrinks the
  //                layout viewport, so dvh already excludes the keyboard even
  //                before JS runs and regardless of visualViewport quirks.
  // Other routes keep normal document flow + scrolling.
  const inConversation = !!useMatch('/chat/:id');

  // A returning member lands in their saved language (unless they've already
  // made an explicit local pick). Guarded inside the store, so this is idempotent.
  React.useEffect(() => {
    if (user) setLangFromUser(user);
  }, [user, setLangFromUser]);

  return (
    <div
      className={cn('flex flex-col bg-bg', !inConversation && 'min-h-full')}
      style={inConversation ? { height: 'var(--vvh, 100dvh)' } : undefined}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2 px-4 md:max-w-2xl lg:max-w-3xl">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand text-text-inverse text-xs font-semibold">
              DK
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

      <main
        className={cn(
          'mx-auto flex w-full max-w-md flex-col md:max-w-2xl lg:max-w-3xl',
          // In a conversation the frame is a fixed height (--vvh): clip here and
          // let the message list scroll internally, so the composer stays pinned
          // to the bottom. Reserve tab-bar space only while the bar is visible.
          inConversation
            ? cn('min-h-0 flex-1 overflow-hidden', !keyboardOpen && 'pb-20')
            : 'flex-1 pb-20',
        )}
      >
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

      {/* Slide the tab bar out of the way while the keyboard is up so it never
          sits between the composer and the keyboard (and the composer can take
          the very bottom of the visible viewport). It returns on blur. */}
      <nav
        aria-hidden={keyboardOpen}
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface',
          'pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-200',
          keyboardOpen && 'pointer-events-none translate-y-full',
        )}
      >
        <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 pt-1 md:max-w-2xl lg:max-w-3xl">
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
