import { CalendarCheck, FileText, MessageCircle, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { unreadState } from '@/features/chat/conversationLabel';
import { tabVisible, todoCount } from '@/features/kavach/kavachView';
import { useKavach } from '@/hooks/api/useKavach';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { cn } from '@/lib/cn';
import { isEmbedded } from '@/lib/embedMode';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

import { useTabBarHidden } from './tabBarVisibility';

/** The four tabs, and the address each one lives at. */
export const TAB_PATHS = { today: '/', chats: '/chat', reports: '/reports', kavach: '/kavach' } as const;
type Tab = keyof typeof TAB_PATHS;

/** Which tab an address is, or null on a screen that carries no bar. Exact match, so a thread, Settings and every sub-page have none. */
export function tabOf(pathname: string): Tab | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === TAB_PATHS.today) return 'today';
  if (path === TAB_PATHS.chats) return 'chats';
  if (path === TAB_PATHS.reports) return 'reports';
  if (path === TAB_PATHS.kavach) return 'kavach';
  return null;
}

/**
 * The bottom bar with up to four doors: Today, Chats, Reports and Kavach (ADR 0055 §1, ADR 0056 §4,
 * ADR 0057 §5). The Kavach door is there only for an outlet whose Kavach is on.
 *
 * Drawn only on those screens — never inside a chat, Settings or any sub-page,
 * never in the extension's side panel, and not while the keyboard is up or a
 * screen has asked for it to step aside (the chat list's search, and every open
 * report: `ReportHost` asks while its overlay is up). A tap REPLACES the history
 * entry: the tabs are siblings, so Back from any of them leaves the app the way Back
 * from the chat list always did, instead of walking through every tab the dealer
 * touched.
 *
 * The badges say what is waiting: on Today the number of open tasks, on Chats the
 * number of chats with something unread, on Kavach the number of points to do now. All three are
 * read from answers the app already holds for the screens themselves (Kavach's is the one query
 * the Kavach page and the Today tile share). Reports carries none: nothing there is waiting
 * on the dealer.
 */
export function TabBar({ keyboardOpen = false }: { keyboardOpen?: boolean }) {
  const { pathname } = useLocation();
  const hiddenByScreen = useTabBarHidden();
  const active = tabOf(pathname);
  // The answers behind the badges are asked for only where the bar is drawn: a
  // thread or Settings makes no request for a bar it will not show.
  if (!active || isEmbedded() || keyboardOpen || hiddenByScreen) return null;
  return <Bar active={active} />;
}

function Bar({ active }: { active: Tab }) {
  const t = useT();
  const navigate = useNavigate();
  const myId = useAuthStore((s) => s.user?.id);
  const feed = useTodayFeed();
  const convos = useMyConversations();
  const kavach = useKavach();

  const openTasks = feed.data?.tasks.length ?? 0;
  const kavachOn = tabVisible(kavach.data);
  const kavachTodo = todoCount(kavach.data);
  const unreadChats = (convos.data ?? []).filter((c) => unreadState(c, myId).unread).length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge: number; badgeLabel: string }[] = [
    {
      id: 'today',
      label: t('tabs.today'),
      icon: <CalendarCheck width={24} strokeWidth={1.75} aria-hidden />,
      badge: openTasks,
      badgeLabel: t('tabs.openTasks', { n: openTasks }),
    },
    {
      id: 'chats',
      label: t('tabs.chats'),
      icon: <MessageCircle width={24} strokeWidth={1.75} aria-hidden />,
      badge: unreadChats,
      badgeLabel: t('tabs.unreadChats', { n: unreadChats }),
    },
    {
      id: 'reports',
      label: t('tabs.reports'),
      icon: <FileText width={24} strokeWidth={1.75} aria-hidden />,
      badge: 0,
      badgeLabel: '',
    },
    ...(kavachOn
      ? [
          {
            id: 'kavach' as const,
            label: t('tabs.kavach'),
            icon: <ShieldCheck width={24} strokeWidth={1.75} aria-hidden />,
            badge: kavachTodo,
            badgeLabel: t('tabs.openTasks', { n: kavachTodo }),
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label={t('tabs.label')}
      className="sticky bottom-0 z-30 shrink-0 border-t border-border bg-surface"
    >
      <div
        role="tablist"
        className="safe-bottom mx-auto flex w-full max-w-md pt-1 md:max-w-2xl lg:max-w-3xl"
      >
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                if (!on) navigate(TAB_PATHS[tab.id], { replace: true });
              }}
              className={cn(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg',
                on ? 'text-text' : 'text-text-muted',
              )}
            >
              {/* The current tab's icon sits on a soft pill: seen at a glance, not by colour alone. */}
              <span className={cn('relative rounded-full px-5 py-1 transition-colors duration-150', on ? 'bg-surface-2' : '')}>
                {tab.icon}
                {tab.badge > 0 ? (
                  <span
                    role="img"
                    aria-label={tab.badgeLabel}
                    className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-wa-badge px-1 text-micro font-medium leading-none text-white"
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </span>
              <span className={cn('break-words px-1 text-center text-meta', on ? 'font-semibold' : 'font-medium')}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
