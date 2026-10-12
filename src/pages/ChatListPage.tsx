import { ArrowLeft, MessageCircle, RefreshCw, Search, Users, X } from 'lucide-react';
import * as React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { AppBar, AppBarIconButton, type AppBarMenuItem } from '@/components/AppBar';
import { BrandMark } from '@/components/BrandMark';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { AskBarSlot } from '@/features/asks/askBarSlot';
import {
  conversationPreview,
  conversationTitle,
  filterConversations,
  formatListTime,
  hasGroupThread,
  unreadState,
  type ChatChip,
} from '@/features/chat/conversationLabel';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { useBackToClose } from '@/lib/useBackToClose';
import { useAuthStore } from '@/store/auth';
import type { Conversation } from '@dk/shared/types';

/**
 * A conversation id as the server writes it. Checked before an old-style link is
 * trusted, because the id goes straight into a route.
 */
const LEGACY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The first screen of the app: the dealer's chats, the way WhatsApp lists them.
 *
 * `/chat?c=<id>` is the form older notifications carry (the native shell turns a
 * push that names only a conversation into that link). It lands here, and goes
 * on into the thread — replacing the entry, so Back does not bounce through a
 * list the dealer never asked for.
 */
export function ChatListPage() {
  const [params] = useSearchParams();
  const legacy = params.get('c');
  if (legacy && LEGACY_ID.test(legacy)) {
    return <Navigate to={`/chat/${encodeURIComponent(legacy)}`} replace />;
  }
  return <ChatList />;
}

function ChatList() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const myId = useAuthStore((s) => s.user?.id);
  const q = useMyConversations();

  const [searching, setSearching] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [chip, setChip] = React.useState<ChatChip>('all');

  const closeSearch = React.useCallback(() => {
    setSearching(false);
    setQuery('');
  }, []);
  // The phone's Back button leaves the search, not the app — this is the first
  // screen, so an ordinary Back from it would close the app with the keyboard up.
  useBackToClose(closeSearch, searching);

  const menu = React.useMemo<AppBarMenuItem[]>(
    () => [
      {
        key: 'settings',
        label: t('chatlist.settings'),
        onSelect: () => navigate('/settings'),
      },
    ],
    [t, navigate],
  );

  const openThread = (id: string) => {
    const go = () => navigate(`/chat/${encodeURIComponent(id)}`);
    if (!searching) {
      go();
      return;
    }
    // Leave the search first, then go — see `afterOverlayCloses`.
    closeSearch();
    afterOverlayCloses(go);
  };

  const bar = searching ? (
    <SearchBar query={query} onChange={setQuery} onClose={closeSearch} />
  ) : (
    <AppBar
      variant="home"
      title={t('app.brand')}
      actions={
        <AppBarIconButton
          label={t('chatlist.search')}
          icon={<Search width={22} strokeWidth={2} />}
          onClick={() => setSearching(true)}
        />
      }
      menu={menu}
    />
  );

  // The server guarantees every dealer member at least one thread, so an empty
  // list can only mean the fetch never succeeded. Treat "couldn't load" as its
  // own state: rendering it as "No chats yet" tells the user their chats are
  // gone and leaves them with nothing to tap. `isLoading` alone is not enough —
  // it is false while the query is PAUSED (offline) or disabled, both of which
  // would otherwise fall through to the empty state.
  //
  // The bar above stays on every one of these states: Settings (and with it
  // Log out) must still be reachable when the list could not be loaded.
  //
  // ONLY WHEN THERE IS NOTHING TO SHOW. A background refetch that fails keeps
  // `isError` true with the chats still in hand; on a flaky 2G link that is every
  // Back from a thread (the list remounts and refetches once its 30 seconds are
  // up), and it hid chats already on the phone behind "Try again".
  const failed =
    !q.data && (q.isError || (q.status === 'pending' && q.fetchStatus === 'paused'));

  if (failed) {
    return (
      <>
        {bar}
        <div className="flex flex-1 items-center justify-center px-4">
          <EmptyState
            icon={<MessageCircle width={28} strokeWidth={1.5} />}
            title={t('chat.listErrorTitle')}
            description={t('chat.listErrorDesc')}
            cta={
              <Button
                onClick={() => void q.refetch()}
                loading={q.isFetching}
                leftIcon={<RefreshCw width={16} strokeWidth={1.75} />}
              >
                {t('chat.retry')}
              </Button>
            }
          />
        </div>
      </>
    );
  }

  if (q.status === 'pending') {
    return (
      <>
        {bar}
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      </>
    );
  }

  const convos = q.data ?? [];

  if (convos.length === 0) {
    return (
      <>
        {bar}
        <div className="flex flex-1 items-center justify-center px-4">
          <EmptyState
            icon={<MessageCircle width={28} strokeWidth={1.5} />}
            title={t('chat.noConversations')}
            description={t('chat.noConversationsDesc')}
          />
        </div>
      </>
    );
  }

  // There is no auto-forward into the thread, even for a member with exactly one
  // (the manager, and an owner at a pump with no manager): WhatsApp always opens
  // on its list, and a screen that skipped it would have nowhere to hang the
  // search and the ⋮ menu that Settings is reached from.
  const showGroups = hasGroupThread(convos);
  // A chip that is no longer on offer (the group thread went away on a refetch)
  // must not leave the list filtered by something the dealer cannot see or undo.
  const activeChip: ChatChip = chip === 'groups' && !showGroups ? 'all' : chip;
  const rows = filterConversations(convos, { chip: activeChip, query, myId, t });

  return (
    <>
      {bar}
      <div className="flex flex-1 flex-col bg-wa-bar">
        <FilterChips
          active={activeChip}
          showGroups={showGroups}
          onChange={setChip}
        />
        {rows.length === 0 ? (
          <p className="px-8 py-12 text-center text-[15px] text-wa-meta">
            {query.trim() ? t('chatlist.noMatch') : t('chatlist.noUnread')}
          </p>
        ) : (
          <ul className="flex-1">
            {rows.map((c) => (
              <ChatRow
                key={c.id}
                conv={c}
                myId={myId}
                lang={lang}
                onOpen={openThread}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * The bar while searching: ← to leave, a field, a ✕ to wipe what was typed.
 * Laid out exactly like `AppBar` (same height, same sticky wrapper, the ask
 * strip still hanging underneath) so nothing jumps when it takes the bar's place.
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
    <div className="sticky top-0 z-30 shrink-0">
      <div className="border-b border-wa-divider bg-wa-bar">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-1 pl-1 pr-1 md:max-w-2xl lg:max-w-3xl">
          <AppBarIconButton
            label={t('common.back')}
            icon={<ArrowLeft width={24} strokeWidth={2} />}
            onClick={onClose}
          />
          <input
            type="text"
            role="searchbox"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter puts the keyboard away and keeps the results, as WhatsApp does.
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder={t('chatlist.searchPlaceholder')}
            aria-label={t('chatlist.search')}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-base text-wa-bar-text outline-none placeholder:text-wa-meta"
          />
          {query ? (
            <AppBarIconButton
              label={t('chatlist.clearSearch')}
              icon={<X width={22} strokeWidth={2} />}
              onClick={() => onChange('')}
            />
          ) : null}
        </div>
      </div>
      <AskBarSlot />
    </div>
  );
}

/** All · Unread · Groups — rounded pills; the one in use is the light-green one. */
function FilterChips({
  active,
  showGroups,
  onChange,
}: {
  active: ChatChip;
  showGroups: boolean;
  onChange: (chip: ChatChip) => void;
}) {
  const t = useT();
  const chips: { id: ChatChip; label: string }[] = [
    { id: 'all', label: t('chatlist.filterAll') },
    { id: 'unread', label: t('chatlist.filterUnread') },
    ...(showGroups ? [{ id: 'groups' as const, label: t('chatlist.filterGroups') }] : []),
  ];
  return (
    <div
      role="group"
      aria-label={t('chatlist.filters')}
      className="flex shrink-0 gap-2 overflow-x-auto px-3 py-2"
    >
      {chips.map((c) => {
        const on = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.id)}
            className={cn(
              'h-8 shrink-0 rounded-full border px-3.5 text-[14px] font-medium',
              on
                ? 'border-transparent bg-wa-out text-wa-accent-strong'
                : 'border-wa-divider bg-wa-bar text-wa-meta active:bg-wa-row-active',
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One chat, 72px high. The divider starts after the avatar, so it is drawn on
 * the text column and not on the row.
 */
function ChatRow({
  conv,
  myId,
  lang,
  onOpen,
}: {
  conv: Conversation;
  myId: string | undefined;
  lang: 'en' | 'hi';
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const { unread, count } = unreadState(conv, myId);
  const group = conv.kind === 'manager';
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(conv.id)}
        className="flex h-[72px] w-full items-center pl-4 text-left active:bg-wa-row-active"
      >
        {/* The MDG support chat wears the logo on a light tint; the manager group
            wears a group icon — neither has a photo to show. */}
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
            group ? 'bg-wa-row-active text-wa-bar-icon' : 'bg-wa-out text-wa-accent-strong',
          )}
          aria-hidden
        >
          {group ? (
            <Users width={26} strokeWidth={1.75} />
          ) : (
            <BrandMark size={32} />
          )}
        </span>
        <span className="ml-3 flex h-full min-w-0 flex-1 flex-col justify-center border-b border-wa-divider pr-4">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-base font-medium text-wa-bar-text">
              {conversationTitle(conv, t)}
            </span>
            <span
              className={cn(
                'shrink-0 text-xs',
                unread ? 'font-medium text-wa-badge' : 'text-wa-meta',
              )}
            >
              {formatListTime(conv.lastMessageAt, lang, t)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            {/* One line whatever lands here. From v2 the first line composes its
                own prose — up to 280 characters of Hindi, about 35% longer than
                English — and two lines for one thread would push the rest of the
                list off a 360px screen. */}
            <span className="truncate text-sm text-wa-meta">
              {conversationPreview(conv, myId, t)}
            </span>
            {unread ? <UnreadPill count={count} /> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The green count. With no number known (an older server), a bare dot. */
function UnreadPill({ count }: { count: number | null }) {
  const t = useT();
  if (count === null) {
    return (
      <span
        role="img"
        aria-label={t('chatlist.filterUnread')}
        className="h-3 w-3 shrink-0 rounded-full bg-wa-badge"
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={t('chatlist.unreadCount', { n: count })}
      className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-wa-badge px-1.5 text-xs font-medium leading-none text-white"
    >
      {count > 999 ? '999+' : count}
    </span>
  );
}
