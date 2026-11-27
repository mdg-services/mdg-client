import { CalendarCheck, FileText, LayoutGrid, MessageCircle, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { unreadState } from '@/features/chat/conversationLabel';
import { tabVisible, todoCount } from '@/features/kavach/kavachView';
import { useIsPlanner } from '@/features/planner/isPlanner';
import { heroShows } from '@/features/setup/heroView';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { useKavach } from '@/hooks/api/useKavach';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { cn } from '@/lib/cn';
import { isEmbedded } from '@/lib/embedMode';
import { useT } from '@/lib/i18n';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';

import { useTabBarHidden } from './tabBarVisibility';
import { BACK_GOES_TO_TODAY, REPORTS_AS_TAB } from './tabConfig';
import { todayBadgeCounts } from './todayBadge';
import { useKavachMemory } from './useKavachMemory';

/** The doors, and the address each one lives at. `reports` is a door only while `REPORTS_AS_TAB` is on. */
export const TAB_PATHS = {
  today: '/',
  services: '/services',
  reports: '/reports',
  kavach: '/kavach',
  chat: '/chat',
} as const;
export type Tab = keyof typeof TAB_PATHS;

/**
 * Which door an address belongs to, or null on a screen that carries no bar. Exact match, so a
 * thread, a service page, My pump, Settings and every other sub-page have none. `/reports` is the
 * Services door's second pill, so it belongs to Services (unless `REPORTS_AS_TAB` makes it a door).
 */
export function tabOf(pathname: string): Tab | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === TAB_PATHS.today) return 'today';
  if (path === TAB_PATHS.services) return 'services';
  if (path === TAB_PATHS.reports) return REPORTS_AS_TAB ? 'reports' : 'services';
  if (path === TAB_PATHS.kavach) return 'kavach';
  if (path === TAB_PATHS.chat) return 'chat';
  return null;
}

/**
 * Does a tap on a door REPLACE the history entry, or push one? (spec 2.4, owner decision Q5)
 *
 * With `BACK_GOES_TO_TODAY` on: from Today to another door it PUSHES one entry; from one other door
 * to another it REPLACES; to Today it REPLACES. So Back from Services, Kavach or Chat lands on Today,
 * and Back on Today leaves the app. Off: every tap replaces, so Back from any door leaves the app.
 */
export function tapReplacesEntry(from: Tab, to: Tab, backGoesToToday: boolean = BACK_GOES_TO_TODAY): boolean {
  if (!backGoesToToday) return true;
  return from !== 'today' || to === 'today';
}

/**
 * The bar at the bottom: four doors, Today, Services, Kavach and Chat, three where Kavach is off
 * (spec 2.1; ADR 0055, 0056, 0057 as changed by 0061). Reports is a pill inside Services.
 *
 * Drawn only on the door addresses, never inside a chat, a sub-page, My pump or Settings, never in
 * the extension's side panel, and not while the keyboard is up or a screen has asked for it to step
 * aside (the chat list's search, and every open report: `ReportHost` asks while its overlay is up).
 *
 * The badges say what is waiting, in words for a screen reader: on Today "2 for you" (the work waiting for the reader; the verdict card carries the "look" count),
 * on Chat the chats with something unread, on Kavach the points to do now. Services carries none:
 * its Reports pill shows its own count. All are read from answers the app already holds.
 *
 * At large text (140% or more) the bar becomes a two-column grid of labels, with an odd last door
 * across both columns: a one-row bar cannot hold "Services" at 200%. The icons go (spec 2.3's
 * fallback: with them "Services" broke mid-word, and the bar took 34 to 41 percent of a 640 px
 * phone); no label is ever hidden or cut.
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

interface Door {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  badge: number;
  badgeLabel: string;
}

function Bar({ active }: { active: Tab }) {
  const t = useT();
  const navigate = useNavigate();
  const large = useLargeText();
  const myId = useAuthStore((s) => s.user?.id);
  const feed = useTodayFeed();
  const convos = useMyConversations();
  const kavach = useKavach();
  // The owner's and the manager's badges read the same answers but count different jobs, so the
  // signed-in role goes into every count (the Kavach page counts by the same role).
  const authRole = useAuthStore((s) => s.user?.role);
  const role = authRole === 'dealer-owner' ? 'owner' : 'manager';
  // While the setup hero stands in the verdict's place it carries the feed's setup task itself.
  const setup = useOutletSetup();
  const setupShown = heroShows(setup.data);
  // Someone planning a pump (ADR 0058) has no reports and no Kavach: Today and Chats only.
  const planner = useIsPlanner();

  const now = new Date();
  const { needYou } = todayBadgeCounts({
    feed: feed.data,
    kavach: kavach.data?.on ? kavach.data : null,
    role,
    now,
    setupShown,
  });
  // Only the work that waits for the reader: the card's own "need you" number (see `todayBadge.ts`).
  const todayBadge = needYou;
  const todayLabel = needYou > 0 ? t('shell.badge.need', { n: needYou }) : '';
  const kavachOn = useKavachMemory(kavach.data ? tabVisible(kavach.data) : undefined);
  const kavachTodo = todoCount(kavach.data, now, authRole);
  const unreadChats = (convos.data ?? []).filter((c) => unreadState(c, myId).unread).length;

  const iconProps = { width: 24, height: 24, strokeWidth: 1.75, 'aria-hidden': true } as const;
  const doors: Door[] = [
    {
      id: 'today',
      label: t('shell.tab.today'),
      icon: <CalendarCheck {...iconProps} />,
      badge: todayBadge,
      badgeLabel: todayLabel,
    },
    // Someone planning a pump (ADR 0058) has no services, reports or Kavach: Today and Chat only.
    ...(planner
      ? []
      : [{ id: 'services' as const, label: t('shell.tab.services'), icon: <LayoutGrid {...iconProps} />, badge: 0, badgeLabel: '' }]),
    ...(REPORTS_AS_TAB && !planner
      ? [{ id: 'reports' as const, label: t('shell.tab.reports'), icon: <FileText {...iconProps} />, badge: 0, badgeLabel: '' }]
      : []),
    ...(kavachOn && !planner
      ? [
          {
            id: 'kavach' as const,
            label: t('shell.tab.kavach'),
            icon: <ShieldCheck {...iconProps} />,
            badge: kavachTodo,
            badgeLabel: t('shell.badge.todo', { n: kavachTodo }),
          },
        ]
      : []),
    {
      id: 'chat',
      label: t('shell.tab.chat'),
      icon: <MessageCircle {...iconProps} />,
      badge: unreadChats,
      badgeLabel: t('shell.badge.unread', { n: unreadChats }),
    },
  ];

  const go = (to: Tab) => {
    if (to === active) return;
    navigate(TAB_PATHS[to], { replace: tapReplacesEntry(active, to) });
  };

  return (
    <nav
      aria-label={t('shell.tab.label')}
      className="sticky bottom-0 z-30 box-border w-full shrink-0 overflow-x-clip border-t border-border bg-surface"
    >
      <div
        role="tablist"
        data-layout={large ? 'grid' : 'row'}
        className={cn(
          'safe-bottom mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl',
          large ? 'grid grid-cols-2 gap-1 px-2 pt-1' : 'flex pt-1',
        )}
      >
        {doors.map((door, i) => {
          const on = door.id === active;
          const lastOdd = large && i === doors.length - 1 && doors.length % 2 === 1;
          const badge =
            door.badge > 0 ? (
              <span
                role="img"
                aria-label={door.badgeLabel}
                className={cn(
                  'inline-flex items-center justify-center rounded-full bg-wa-badge px-1 text-micro font-medium leading-none text-white',
                  // Over the icon the badge is 20 px; beside a label at large text it is sized from its own
                  // text (1.25 em), so at 200% it is 30 px and not the 40 px that pushed it under the word.
                  large ? 'h-[1.25em] min-w-[1.25em]' : 'absolute -right-2 -top-2 h-5 min-w-5',
                )}
              >
                {door.badge > 99 ? '99+' : door.badge}
              </span>
            ) : null;
          if (large) {
            // Large text: label only, two columns. The label is the whole door: "Services" at 200% is
            // about 116 px wide, and a door is 160, so an icon beside it would push the word onto two
            // lines mid-letter (measured, Appendix A). The chosen door is a raised, outlined box AND
            // bold, so it is still not told by colour. The badge follows the label, and wraps below
            // it rather than squeezing the word.
            return (
              <button
                key={door.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => go(door.id)}
                className={cn(
                  'flex min-h-tap min-w-0 flex-wrap items-center gap-x-1.5 rounded-lg px-1.5 py-1 text-left',
                  lastOdd && 'col-span-2',
                  on ? 'bg-surface-2 text-text ring-2 ring-inset ring-text' : 'text-text-muted',
                )}
              >
                <span className={cn('break-words text-meta', on ? 'font-semibold' : 'font-medium')}>{door.label}</span>
                {badge}
              </button>
            );
          }
          return (
            <button
              key={door.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(door.id)}
              className={cn(
                'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg',
                on ? 'text-text' : 'text-text-muted',
              )}
            >
              {/* The current door's icon sits on a soft pill: seen at a glance, not by colour alone. */}
              <span
                className={cn(
                  'shrink-0 rounded-full px-4 py-1 transition-colors duration-150',
                  on ? 'bg-surface-2' : '',
                )}
              >
                {/* The badge hangs on the corner of the 24 px icon, not of the wider pill, so it can
                    never reach the neighbouring door. */}
                <span className="relative block h-6 w-6">
                  {door.icon}
                  {badge}
                </span>
              </span>
              <span className={cn('break-words px-1 text-center text-meta', on ? 'font-semibold' : 'font-medium')}>
                {door.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
