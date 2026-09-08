import { FileText, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { EmptyState, Spinner } from '@/components/ui';
import { AskCard } from '@/features/asks/AskCard';
import { EMPTY_ASK_LIST, askMatchKey, groupAsks } from '@/features/asks/askRules';
import { useAskCapture } from '@/features/asks/useAskCapture';
import { askIdFromSearch, findAskRow, renewalPointer } from '@/features/documents/documentRules';
import { OnFileCard } from '@/features/documents/OnFileCard';
import { useMyAsks } from '@/hooks/api/useAsks';
import {
  useDocumentsOnFileSocket,
  useMyDocumentsOnFile,
  useOpenDocumentFile,
} from '@/hooks/api/useDocuments';
import { useT } from '@/lib/i18n';
import { queuedFor, useAskQueueStore } from '@/store/askQueue';
import { useAuthStore } from '@/store/auth';
import type { DealerDocumentAskRow } from '@dk/shared/types';

/**
 * Every paper in this dealer's life: the ones MDG is waiting for, and the ones
 * MDG already holds.
 *
 * ONE SCREEN, BECAUSE A DEALER HAS ONE WORD FOR ALL OF IT
 * ------------------------------------------------------
 * "काग़ज़". A fire NOC MDG is asking for and the fire NOC MDG accepted last
 * March are the same object to the person who owns them, and putting them on
 * two screens would make a 55-year-old pump owner learn which of our two lists
 * a certificate is currently on in order to look at it. That is the same
 * argument the ask list already makes for unioning its three sources, applied
 * one level up.
 *
 * GROUPED BY WHOSE TURN IT IS, THEN BY WHAT IS ON FILE
 * ---------------------------------------------------
 * "बाकी है" then "भेज दिया" then "हो गया" then "MDG के पास जमा", because the
 * only question a dealer opens this screen with is "what do I still have to
 * do?" — and the answer has to be at the top, above the things that are
 * somebody else's problem now, and well above the filing cabinet, which nobody
 * opens the app in a hurry to read. The first three groups come from
 * `documentAskWaitingOn` in `shared`, the same function the admin's estate view
 * uses, so the two screens can never disagree about who is holding a paper up.
 *
 * The third group is deliberate. The server keeps an ACCEPTED row on the to-do
 * list for a few days precisely so the dealer gets to SEE that it landed;
 * dropping those here would undo that, and a request that vanishes the instant
 * it is answered reads as a request that was lost. It is also why "हो गया" and
 * "MDG के पास जमा" both exist and are not the same list: the first is the last
 * few days of news, the second is everything MDG has ever accepted.
 *
 * FOUR FLAT SECTIONS AND NO TABS. A segmented control would keep the screen
 * shorter, and it would also hide one half behind a tap that a dealer who has
 * never seen this screen has no reason to make. Scrolling is a thing every
 * dealer already does; a hidden second list is a thing we would have to teach.
 *
 * ?ask= STILL RESOLVES, AND THAT IS NOT OPTIONAL. The server builds every
 * document push as `/documents?ask=<id>` (`services/documents/notify.ts`) and
 * notifications carrying that string are already on phones. This screen now
 * reads the parameter and scrolls to the card, which is what those links always
 * meant; before it did, the tap landed on the right list at the wrong scroll
 * position.
 */
export function DocumentsPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const dealerId = useAuthStore((s) => s.user?.dealerId);
  const meQuery = useMyAsks();
  const onFileQuery = useMyDocumentsOnFile();
  const openFile = useOpenDocumentFile();
  const items = useAskQueueStore((s) => s.items);

  // EVERY HOOK ABOVE EVERY DECISION, and there are no early returns before this
  // line. This screen is reached from a bar that stays mounted across the
  // navigation into it, and this feature has already shipped two white screens
  // from a hook that ran on one render and not the next (React #310 / #300).
  useDocumentsOnFileSocket();

  const list = meQuery.data ?? EMPTY_ASK_LIST;
  const onFile = onFileQuery.data ?? EMPTY_ASK_LIST;
  const capture = useAskCapture(list);

  const groups = React.useMemo(() => groupAsks(list.rows), [list.rows]);
  // Keyed by `(kindCode, periodKey)` rather than by row id, so a photograph
  // queued against a derived `owed` line still finds its card after the server
  // has minted a real ask with a brand new id for it.
  const queuedByKey = React.useMemo(() => {
    const map = new Map<string, (typeof items)[number]>();
    for (const item of queuedFor(items, dealerId)) map.set(item.matchKey, item);
    return map;
  }, [items, dealerId]);

  const goToKavach = React.useCallback(() => navigate('/kavach'), [navigate]);
  const openPaper = React.useCallback(
    (row: DealerDocumentAskRow) => openFile(row.id),
    [openFile],
  );

  /* ─────────────── The card a notification asked us to show ─────────────── */

  // Held in state rather than read straight from the URL on every render,
  // because the renewal strip on a filed paper sets it too — one mechanism for
  // "put this card in front of the dealer", whether the request came from a
  // push or from a tap six rows down.
  const [focusId, setFocusId] = React.useState<string | null>(() =>
    askIdFromSearch(location.search),
  );
  const focusRef = React.useRef<HTMLDivElement | null>(null);
  const deepLinkId = askIdFromSearch(location.search);

  React.useEffect(() => {
    setFocusId(deepLinkId);
  }, [deepLinkId]);

  const focusRow = findAskRow(list.rows, focusId);
  const focusKey = focusRow?.id ?? null;

  // Tapping the renewal strip on a filed paper puts the request itself in front
  // of the dealer, which is higher up this same screen — so it moves the focus
  // rather than navigating. A `navigate` to a route we are already standing on
  // would be a tap that visibly does nothing.
  const showRenewal = React.useCallback(
    (row: DealerDocumentAskRow) => setFocusId(row.id),
    [],
  );

  React.useEffect(() => {
    if (!focusKey) return;
    const node = focusRef.current;
    if (!node) return;
    // `block: 'center'` rather than the default `start`: the shell's header is
    // sticky and the ask bar can sit under it, so a card scrolled to the top of
    // the document lands underneath both of them.
    node.scrollIntoView?.({ block: 'center' });
  }, [focusKey]);

  const card = (row: DealerDocumentAskRow) => {
    const focused = focusKey !== null && row.id === focusKey;
    return (
      // A ring as well as a scroll. A dealer who tapped a notification about one
      // certificate and landed on a list of six needs to be told which of the
      // six the notification meant, and a scroll position alone does not say it
      // — least of all on a phone that restored the page mid-list.
      <div
        key={row.id}
        ref={focused ? focusRef : undefined}
        className={focused ? 'rounded-2xl ring-2 ring-brand' : undefined}
      >
        <AskCard
          row={row}
          today={list.today}
          {...(queuedByKey.get(askMatchKey(row))
            ? { queued: queuedByKey.get(askMatchKey(row)) }
            : {})}
          onCamera={capture.openCamera}
          onFiles={capture.openFiles}
          onKavach={goToKavach}
        />
      </div>
    );
  };

  if (meQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  }

  if (meQuery.isError) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('documents.pageTitle')}
        </h1>
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('density.errorTitle')}
          description={t('common.helpDesc')}
        />
        <HelpFooter />
      </div>
    );
  }

  const nothing =
    groups.todo.length === 0 && groups.sent.length === 0 && groups.done.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-text">
        {t('documents.pageTitle')}
      </h1>

      {nothing ? (
        // A calm, true sentence rather than an empty list that reads like
        // something is broken.
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('asks.emptyTitle')}
          description={t('asks.emptyDesc')}
        />
      ) : null}

      {groups.todo.length > 0 ? (
        <Section title={t('asks.groupTodo')}>{groups.todo.map(card)}</Section>
      ) : null}
      {groups.sent.length > 0 ? (
        <Section title={t('asks.groupSent')}>{groups.sent.map(card)}</Section>
      ) : null}
      {groups.done.length > 0 ? (
        <Section title={t('asks.groupDone')}>{groups.done.map(card)}</Section>
      ) : null}

      <Section title={t('documents.onFileTitle')} description={t('documents.onFileDesc')}>
        {/* The cabinet loads on its own clock and fails on its own. A dealer
            who came here to answer a request must not be shown a spinner
            instead of the request because a 500-row list is still coming down
            a 2G link, and must not be shown an error page because it never
            arrived. Both stay inside this section. */}
        {onFileQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={18} />
          </div>
        ) : onFileQuery.isError ? (
          <EmptyState
            icon={<FileText width={28} strokeWidth={1.5} />}
            title={t('density.errorTitle')}
            description={t('common.helpDesc')}
          />
        ) : onFile.rows.length === 0 ? (
          <EmptyState
            icon={<FileText width={28} strokeWidth={1.5} />}
            title={t('documents.onFileEmptyTitle')}
            description={t('documents.onFileEmptyDesc')}
          />
        ) : (
          // Already sorted most-urgent-first BY THE SERVER, with
          // `compareDocumentValidityRows` from `shared` — the same comparator
          // the admin's estate view sorts by. Re-sorting here would be a second
          // opinion about which certificate is the most pressing, and the two
          // would drift.
          onFile.rows.map((row) => (
            <OnFileCard
              key={row.id}
              row={row}
              today={onFile.today}
              onOpen={openPaper}
              renewal={renewalPointer(row, list.rows)}
              onRenewal={showRenewal}
            />
          ))
        )}
      </Section>

      <HelpFooter />

      {capture.elements}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="px-1 text-sm font-semibold text-text-muted">{title}</h2>
        {description ? (
          <p className="px-1 text-xs text-text-subtle">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A person, at the bottom of the screen.
 *
 * The same footer `/density` carries, and for the same reason: a dealer who
 * cannot find the paper, or who thinks MDG is asking for the wrong thing, has
 * nowhere else to go — and "message us" is a better ending to this screen than
 * a list they cannot argue with.
 */
function HelpFooter() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => navigate('/chat')}
      className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium text-brand shadow-sm active:bg-surface-2"
    >
      <MessageCircle width={16} strokeWidth={1.75} />
      {t('density.helpLine')}
    </button>
  );
}
