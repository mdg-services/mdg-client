import { ArrowLeft, ChevronRight, Search, Users, X } from 'lucide-react';
import * as React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { BrandMark } from '@/components/BrandMark';
import {
  EmptyCalm,
  ErrorCard,
  PageHeader,
  PillGroup,
  SkeletonBlock,
  StatusPill,
} from '@/components/kit';
import { Card } from '@/components/ui';
import {
  conversationPreview,
  conversationTitle,
  filterConversations,
  formatListTime,
  hasGroupThread,
  rowPreview,
  tasksByConversation,
  ticketLine,
  unreadState,
  type ChatChip,
} from '@/features/chat/conversationLabel';
import { legacyThreadId } from '@/features/tabs/legacyLink';
import { useHideTabBar } from '@/features/tabs/tabBarVisibility';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { markFirstScreen } from '@/lib/perfReport';
import { useBackToClose } from '@/lib/useBackToClose';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import type { Conversation } from '@dk/shared/types';

/** The list shows its filter chips only from this many chats up (spec 4.6): with a few chats they are noise. */
const CHIPS_FROM = 4;

/**
 * The Chats door: the place to ask and to answer, not the home (spec 4.6; Today is the home). Each row
 * says who it is, the last words, what in that chat waits for the dealer, where the dealer's question
 * to MDG stands, and whether it is unread, always in words next to its shape.
 *
 * `/chat?c=<id>` is the form older notifications carry (the native shell turns a push that names only a
 * conversation into that link). It lands here, and goes on into the thread, replacing the entry, so Back
 * does not bounce through a list the dealer never asked for.
 */
export function ChatListPage() {
  const [params] = useSearchParams();
  const legacy = legacyThreadId(params);
  if (legacy) {
    return <Navigate to={`/chat/${encodeURIComponent(legacy)}`} replace />;
  }
  return <ChatList />;
}

/** Re-draws once a minute while it is on: "update by 4:10 pm" turns into "taking longer" with no message from the server. */
function useMinuteTick(active: boolean) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [active]);
}

function ChatList() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const large = useLargeText();
  const myId = useAuthStore((s) => s.user?.id);
  const q = useMyConversations();
  // The same feed the tab bar and Today hold: no extra request. A feed that has not answered (or an
  // older server) simply gives the rows no "waits for you" line.
  const feed = useTodayFeed();
  const waiting = React.useMemo(() => tasksByConversation(feed.data?.tasks), [feed.data?.tasks]);
  // Where the app opens inside the extension's panel (and on a link to /chat), this list with its
  // chats is the first real screen: the moment the speed report counts "opening the app" up to
  // (lib/perfReport). Once per page, so Today's mark wins everywhere else.
  const listShown = !!q.data;
  React.useEffect(() => {
    if (listShown) markFirstScreen();
  }, [listShown]);
  useMinuteTick(!!q.data?.some((c) => (c.tickets?.length ?? 0) > 0));

  const [searching, setSearching] = React.useState(false);
  // The search bar and the keyboard share the screen: the tab bar steps aside.
  useHideTabBar(searching);
  const [query, setQuery] = React.useState('');
  const [chip, setChip] = React.useState<ChatChip>('all');

  const closeSearch = React.useCallback(() => {
    setSearching(false);
    setQuery('');
  }, []);
  // The phone's Back button leaves the search, not the app: this is a root screen (a door), so an
  // ordinary Back from it would close the app with the keyboard up.
  useBackToClose(closeSearch, searching);

  const openThread = (id: string) => {
    const go = () => navigate(`/chat/${encodeURIComponent(id)}`);
    if (!searching) {
      go();
      return;
    }
    // Leave the search first, then go (see `afterOverlayCloses`).
    closeSearch();
    afterOverlayCloses(go);
  };

  const bar = searching ? (
    <SearchBar query={query} onChange={setQuery} onClose={closeSearch} />
  ) : (
    <PageHeader
      variant="tab"
      title={t('chatl.title')}
      right={
        <button
          type="button"
          aria-label={t('chatlist.search')}
          onClick={() => setSearching(true)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-text active:bg-surface-2"
        >
          <Search aria-hidden className="h-6 w-6" strokeWidth={2} />
        </button>
      }
    />
  );

  // The server guarantees every dealer member at least one thread, so an empty list can only mean the
  // fetch never succeeded. "Could not load" is its own state: drawn as "No chats yet" it tells the
  // dealer their chats are gone. `isLoading` alone is not enough: it is false while the query is
  // PAUSED (offline) or disabled, and both would otherwise fall through to the empty state.
  //
  // The bar stays on every state, so My pump (and with it Log out) is still reachable.
  //
  // ONLY WHEN THERE IS NOTHING TO SHOW. A background refetch that fails keeps `isError` true with the
  // chats still in hand; on a flaky 2G link that is every Back from a thread, and it hid chats already
  // on the phone behind "Try again".
  const failed = !q.data && (q.isError || (q.status === 'pending' && q.fetchStatus === 'paused'));

  if (failed) {
    return (
      <>
        {bar}
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <ErrorCard text={t('chatl.error')} onRetry={() => void q.refetch()} />
        </div>
      </>
    );
  }

  if (q.status === 'pending') {
    return (
      <>
        {bar}
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <Card className="p-4">
            <SkeletonBlock lines={5} />
          </Card>
        </div>
      </>
    );
  }

  const convos = q.data ?? [];

  if (convos.length === 0) {
    return (
      <>
        {bar}
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <EmptyCalm text={t('chatl.empty')} />
        </div>
      </>
    );
  }

  // There is no auto-forward into the thread, even for a member with exactly one (the manager, and an
  // owner at a pump with no manager): a screen that skipped the list would have nowhere to hang the
  // search.
  const showGroups = hasGroupThread(convos);
  const showChips = convos.length >= CHIPS_FROM;
  // A chip that is no longer on offer (the group thread went away on a refetch, or the list shrank below
  // the chips' threshold) must not leave the list filtered by something the dealer cannot see or undo.
  const activeChip: ChatChip = !showChips || (chip === 'groups' && !showGroups) ? 'all' : chip;
  const rows = filterConversations(convos, { chip: activeChip, query, myId, t });
  const unreadChats = convos.filter((c) => unreadState(c, myId).unread).length;
  const now = new Date();

  return (
    <>
      {bar}
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {showChips ? (
          <PillGroup<ChatChip>
            label={t('chatlist.filters')}
            value={activeChip}
            onChange={setChip}
            options={[
              { id: 'all', label: t('chatlist.filterAll') },
              {
                id: 'unread',
                label: t('chatlist.filterUnread'),
                ...(unreadChats > 0 ? { count: unreadChats } : {}),
              },
              ...(showGroups ? [{ id: 'groups' as const, label: t('chatlist.filterGroups') }] : []),
            ]}
          />
        ) : null}
        {rows.length === 0 ? (
          <EmptyCalm text={query.trim() ? t('chatlist.noMatch') : t('chatlist.noUnread')} />
        ) : (
          <Card className="overflow-hidden">
            <ul aria-label={t('chatl.list.label')} className="divide-y divide-border">
              {rows.map((c) => (
                <ChatRow
                  key={c.id}
                  conv={c}
                  myId={myId}
                  lang={lang}
                  large={large}
                  now={now}
                  waiting={waiting.get(c.id) ?? 0}
                  onOpen={openThread}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * The bar while searching: an arrow to leave, a field, a cross to wipe what was typed. Laid out like
 * `PageHeader` (same sticky wrapper, hairline and 44px controls) so nothing jumps when it takes the
 * bar's place.
 */
function SearchBar({
  query,
  onChange,
  onClose,
}: {
  query: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-md items-center gap-1 px-2 py-1.5 md:max-w-2xl lg:max-w-3xl">
        <button
          type="button"
          aria-label={t('common.back')}
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text active:bg-surface-2"
        >
          <ArrowLeft aria-hidden className="h-6 w-6" strokeWidth={2} />
        </button>
        <input
          type="text"
          role="searchbox"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter puts the keyboard away and keeps the results.
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          placeholder={t('chatlist.searchPlaceholder')}
          aria-label={t('chatlist.search')}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent px-2 text-body text-text outline-none placeholder:text-text-subtle"
        />
        {query ? (
          <button
            type="button"
            aria-label={t('chatlist.clearSearch')}
            onClick={() => onChange('')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text active:bg-surface-2"
          >
            <X aria-hidden className="h-6 w-6" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

/**
 * One chat. The whole row is one button of at least 56px (it grows with its words, never a fixed
 * height). The name and the preview wrap and are never clipped by the screen; a very long preview is
 * shortened in words by `rowPreview`. Under them: what waits for the dealer in this chat, where the
 * dealer's question to MDG stands, and unread, each a shape and a word.
 */
function ChatRow({
  conv,
  myId,
  lang,
  large,
  now,
  waiting,
  onOpen,
}: {
  conv: Conversation;
  myId: string | undefined;
  lang: Lang;
  large: boolean;
  now: Date;
  waiting: number;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const tn = useTn();
  const { unread, count } = unreadState(conv, myId);
  const group = conv.kind === 'manager';
  const ticket = ticketLine(conv, lang, now);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(conv.id)}
        className={cn(
          'flex min-h-14 w-full gap-3 px-4 py-3 text-left active:bg-surface-2',
          // At large text the row is one column with no picture beside it: at 200% a 96px picture, the
          // arrow and the time left a text column of about 150px, where "सहायता" broke into "सहाय/ता".
          large ? 'flex-col items-stretch gap-1' : 'items-start',
        )}
      >
        {/* The MDG support chat wears the logo on a light tint; the manager group wears a group icon:
            neither has a photo to show. At large text the picture is left out: the name says the same. */}
        {large ? null : (
          <span
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
              group ? 'bg-surface-2 text-text' : 'bg-brand-soft text-text',
            )}
            aria-hidden
          >
            {group ? <Users className="h-6 w-6" strokeWidth={1.75} /> : <BrandMark size={32} />}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              'flex gap-x-2',
              large ? 'flex-col' : 'flex-wrap items-baseline justify-between',
            )}
          >
            <span
              className={cn(
                'min-w-0 break-words hyphens-none text-body text-text',
                unread ? 'font-bold' : 'font-medium',
              )}
            >
              {conversationTitle(conv, t)}
            </span>
            <span
              className={cn(
                'text-meta',
                large ? '' : 'shrink-0',
                unread ? 'font-semibold text-text' : 'text-text-muted',
              )}
            >
              {formatListTime(conv.lastMessageAt, lang, t, now)}
            </span>
          </span>
          <span
            className={cn(
              'break-words hyphens-none text-body',
              unread ? 'text-text' : 'text-text-muted',
            )}
          >
            {rowPreview(conversationPreview(conv, myId, t), large)}
          </span>
          {waiting > 0 ? (
            <StatusPill
              status="waiting"
              word={tn('chatl.waits', waiting)}
              className="w-full whitespace-normal"
            />
          ) : null}
          {ticket ? (
            <StatusPill
              status={ticket.status}
              word={ticket.text}
              className="w-full whitespace-normal"
            />
          ) : null}
          {unread ? <UnreadMark count={count} /> : null}
        </span>
        {large ? null : (
          <ChevronRight aria-hidden className="mt-3 h-5 w-5 shrink-0 text-text-subtle" />
        )}
      </button>
    </li>
  );
}

/**
 * Unread, three ways at once: a dot, the number, and the word "unread". With no number known (an older
 * server) it is the dot and the word alone, never a made-up count.
 */
function UnreadMark({ count }: { count: number | null }) {
  const t = useT();
  const label =
    count === null
      ? t('chatlist.filterUnread')
      : t('chatlist.unreadCount', { n: count > 999 ? '999+' : count });
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex items-center gap-1.5 text-meta font-semibold text-text"
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
      <span aria-hidden className="break-words">
        {label}
      </span>
    </span>
  );
}
