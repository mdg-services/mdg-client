import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AsksModule from '@/hooks/api/useAsks';
import type * as DocumentsModule from '@/hooks/api/useDocuments';
import { useAskQueueStore, type QueuedAskPhoto } from '@/store/askQueue';
import { useLangStore } from '@/store/lang';
import {
  NOC_KIND,
  TODAY,
  YESTERDAY,
  makeAskList,
  makeAskRow,
  makeOnFileList,
  makeOnFileRow,
} from '@/test/askFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerDocumentAskList } from '@dk/shared/types';

/**
 * Every paper in the dealer's life, on one screen.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is still the one about dates: not a single
 * `2026-09-02` may reach the screen, in either language, from a period key,
 * from a due date, or now from a validity. Everything a dealer reads here is
 * either words or a number with a month beside it, and the only three things
 * allowed to produce any of it are `documentPeriodLabel`,
 * `documentValidityLabel` and `dealerProfileDateLabel` — all from `shared`, all
 * fed the SERVER's day.
 *
 * The second thing being defended is the deep link. `/documents?ask=<id>` is
 * the string the server has been putting in every document push since before
 * anything read it, and notifications carrying it are already on phones.
 */

const h = vi.hoisted(() => ({
  list: undefined as DealerDocumentAskList | undefined,
  onFile: undefined as DealerDocumentAskList | undefined,
  onFileLoading: false,
  opened: [] as string[],
}));

vi.mock('@/hooks/api/useAsks', async (orig) => {
  const actual = await orig<typeof AsksModule>();
  return {
    ...actual,
    useMyAsks: () => ({ data: h.list, isLoading: false, isError: false }),
    useAskListSocket: () => undefined,
  };
});

vi.mock('@/hooks/api/useDocuments', async (orig) => {
  const actual = await orig<typeof DocumentsModule>();
  return {
    ...actual,
    useMyDocumentsOnFile: () => ({
      data: h.onFile,
      isLoading: h.onFileLoading,
      isError: false,
    }),
    useDocumentsOnFileSocket: () => undefined,
    // Stable across renders on purpose: the card memoises nothing, but a hook
    // handing back a new function every render is a thing that hides a bug
    // rather than a thing that finds one.
    useOpenDocumentFile: () => async (askId: string) => {
      h.opened.push(askId);
    },
  };
});

const { DocumentsPage } = await import('./DocumentsPage');

function queued(over: Partial<QueuedAskPhoto> = {}): QueuedAskPhoto {
  return {
    matchKey: `tt-register-page|${TODAY}`,
    clientRef: 'ref-00000001',
    dealerId: 'd1',
    askId: `ask-${TODAY}`,
    submitVia: `/v1/asks/me/ask-${TODAY}/submit`,
    kindCode: 'tt-register-page',
    periodKind: 'DAY',
    periodKey: TODAY,
    filename: 'page.jpg',
    contentType: 'image/jpeg',
    kind: 'image',
    size: 3,
    base64: 'AQID',
    queuedAt: '2026-09-02T04:00:00.000Z',
    attempts: 0,
    state: 'queued',
    ...over,
  };
}

function renderPage(lang: 'en' | 'hi' = 'en', route = '/documents') {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/documents" element={<DocumentsPage />} />
      <Route path="/asks" element={<DocumentsPage />} />
      <Route path="/kavach" element={<div>kavach-page</div>} />
    </Routes>,
    { route, withRouter: true },
  );
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  // jsdom implements no scrolling at all, and the deep link reaches for this.
  Element.prototype.scrollIntoView = vi.fn();
  h.onFile = makeOnFileList();
  h.onFileLoading = false;
  h.opened = [];
});

afterEach(() => {
  resetStores();
  useAskQueueStore.setState({ items: [] });
  h.list = undefined;
  h.onFile = undefined;
  vi.restoreAllMocks();
});

describe('DocumentsPage — grouped by whose turn it is', () => {
  it('puts what the dealer still owes above what is with MDG, and the cabinet last', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({ id: 'mine', periodKey: TODAY }),
        makeAskRow({ id: 'theirs', periodKey: YESTERDAY, state: 'SENT', waitingOn: 'mdg' }),
        makeAskRow({
          id: 'over',
          periodKey: '2026-08-31',
          state: 'ACCEPTED',
          waitingOn: 'none',
          reviewedByKind: 'admin',
        }),
      ],
    });
    renderPage();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h2) => h2.textContent);
    // The filing cabinet is a PEER of the three turn groups and it is last. A
    // dealer opens this screen to answer a request, not to browse their own
    // licences — and the request has to be above everything that is somebody
    // else's problem now.
    expect(headings).toEqual(['Still to do', 'Sent', 'Done', 'With MDG on file']);
  });

  it('says who settled it — a person, or a machine that nobody checked', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          id: 'byhand',
          periodKey: YESTERDAY,
          state: 'ACCEPTED',
          waitingOn: 'none',
          reviewedByKind: 'admin',
        }),
        makeAskRow({
          id: 'bysignal',
          periodKey: '2026-08-31',
          state: 'ACCEPTED',
          waitingOn: 'none',
          reviewedByKind: 'system',
        }),
      ],
    });
    renderPage();

    // Collapsing these two would publish, on every automatic acceptance, a claim
    // that somebody at MDG had read the page.
    expect(screen.getByText('MDG has checked it')).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
  });

  it('says something calm when there is nothing at all', () => {
    h.list = makeAskList({ rows: [] });
    renderPage();
    expect(screen.getByText('Nothing to send')).toBeInTheDocument();
  });
});

describe('DocumentsPage — no raw dates, ever', () => {
  it('prints every period and every due date in words', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({ id: 'a', periodKey: TODAY, dueOn: TODAY }),
        makeAskRow({ id: 'b', periodKey: YESTERDAY, dueOn: YESTERDAY, late: true }),
        makeAskRow({ id: 'c', periodKey: '2026-08-28' }),
      ],
    });
    const { container } = renderPage();

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    // Older than yesterday gets a date in words, never the key.
    expect(screen.getByText('28 Aug')).toBeInTheDocument();
    expect(screen.getByText('Wanted by Today')).toBeInTheDocument();
    // THE ASSERTION. `periodLabel` on the fixture is deliberately the raw key,
    // so a screen that printed the server's copy instead of re-formatting it
    // would fail right here.
    expect(container.textContent ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('does the same in Hindi', () => {
    h.list = makeAskList({
      rows: [makeAskRow({ id: 'a', periodKey: YESTERDAY, dueOn: TODAY })],
    });
    const { container } = renderPage('hi');

    expect(screen.getByText('कल')).toBeInTheDocument();
    expect(screen.getByText('आज तक चाहिए')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  /**
   * The cabinet is the one place on a dealer screen that prints a date at all,
   * and it is the place a raw one would be most at home — so both languages get
   * their own assertion, over a payload carrying an expired paper, an expiring
   * one and one still in force.
   */
  it('prints a validity as a date with a year, and never as a key', () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({
      rows: [
        makeOnFileRow({
          id: 'gone',
          titleEn: 'DTO trade licence',
          titleHi: 'डीटीओ लाइसेंस',
          validUntil: '2026-08-31',
          validityState: 'expired',
          daysToExpiry: -2,
        }),
        makeOnFileRow({ id: 'fine', validUntil: '2027-12-31' }),
      ],
    });
    const { container } = renderPage();

    // The YEAR is the point. "31 Aug" on a lapsed licence reads as though it had
    // not lapsed; "31 Dec" on one good until 2027 reads as this year.
    expect(screen.getByText('Was good until 31 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Good until 31 Dec 2027')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('prints a validity in Hindi with no key either', () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({
      rows: [makeOnFileRow({ validUntil: '2027-12-31', daysToExpiry: 485 })],
    });
    const { container } = renderPage('hi');

    expect(screen.getByText('485 दिन बाकी')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('DocumentsPage — what a card offers', () => {
  it('shows MDG’s reason as MDG’s words, verbatim', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          state: 'REJECTED',
          rejectReason: 'The date at the top is cut off. Please shoot the whole page.',
        }),
      ],
    });
    renderPage();

    expect(screen.getByText('MDG wrote:')).toBeInTheDocument();
    expect(
      screen.getByText('The date at the top is cut off. Please shoot the whole page.'),
    ).toBeInTheDocument();
    // And the button says "send again", not "take photo" — they are answering a
    // rejection, not starting fresh.
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument();
  });

  /**
   * THE RULE THE OFFLINE QUEUE EXISTS TO KEEP: never a live camera over bytes
   * that are already waiting. The obvious response to one is to photograph the
   * same page twice.
   */
  it('shows a waiting photo as saved, with no camera over it', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    h.list = makeAskList({ rows: [makeAskRow({ periodKey: TODAY })] });
    useAskQueueStore.setState({ items: [queued()] });
    renderPage();

    expect(
      screen.getByText('The photo is saved. It will go as soon as the internet is back.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take photo' })).not.toBeInTheDocument();
  });

  /**
   * The same photograph, with a network. Promising that it "will go as soon as
   * the internet is back" to a dealer whose internet is plainly working reads as
   * the app not knowing what it is doing.
   */
  it('says it is going, not waiting, when the phone has signal', () => {
    h.list = makeAskList({ rows: [makeAskRow({ periodKey: TODAY })] });
    useAskQueueStore.setState({ items: [queued()] });
    renderPage();

    expect(screen.getByText('Going now…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take photo' })).not.toBeInTheDocument();
  });

  /**
   * A refused photograph is the opposite case: the dealer is told to send it
   * again, so the camera has to come back or the card is a dead end.
   */
  it('gives the camera back when a photo was refused', () => {
    h.list = makeAskList({ rows: [makeAskRow({ periodKey: TODAY })] });
    useAskQueueStore.setState({ items: [queued({ state: 'stuck', attempts: 1 })] });
    renderPage();

    expect(
      screen.getByText('That photo did not go through. Please send it again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
  });

  it('never says a paper sent to MDG is done', () => {
    h.list = makeAskList({
      rows: [makeAskRow({ state: 'SENT', waitingOn: 'mdg' })],
    });
    renderPage();

    // "The dealer sent it" and "MDG accepted it" are different facts about
    // different people, and a tick on the first is a promise the second may not
    // keep.
    expect(screen.getByText('With MDG now')).toBeInTheDocument();
    expect(screen.queryByText('MDG has checked it')).not.toBeInTheDocument();
  });

  /** Kavach evidence is answered on the screen that owns that exchange. */
  it('sends a Kavach row to the Kavach screen', async () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          id: 'kavach:65f0000000000000000000bb',
          source: 'kavach',
          submitVia: '/v1/kavach/items/65f0000000000000000000bb/evidence',
          titleEn: 'Fire extinguisher check',
          titleHi: 'अग्निशामक जाँच',
          periodKind: 'NONE',
          periodKey: '',
        }),
      ],
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Open in Kavach' }));
    expect(await screen.findByText('kavach-page')).toBeInTheDocument();
  });

  /**
   * A settled row lingers on the to-do list for a few days precisely so the
   * dealer sees it landed, and that is exactly when they want to know how long
   * the thing they just sent is good for.
   */
  it('shows how long a paper is good for once MDG holds it', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          id: 'settled',
          state: 'ACCEPTED',
          waitingOn: 'none',
          reviewedByKind: 'admin',
          validUntil: '2026-09-10',
          validityState: 'expiring',
          daysToExpiry: 8,
        }),
      ],
    });
    renderPage();
    expect(screen.getByText('8 days left')).toBeInTheDocument();
  });

  /**
   * An admin may put a validity on a request when they make it — a renewal
   * raised off an inspection letter. "8 days left" beside "Wanted by Today"
   * would be two countdowns about two different things on one card, and the one
   * a dealer reads as the deadline is the wrong one.
   */
  it('keeps the paper’s own date off a card the dealer still owes', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          id: 'owed-with-date',
          dueOn: TODAY,
          validUntil: '2026-09-10',
          validityState: 'expiring',
          daysToExpiry: 8,
        }),
      ],
    });
    renderPage();

    expect(screen.getByText('Wanted by Today')).toBeInTheDocument();
    expect(screen.queryByText('8 days left')).not.toBeInTheDocument();
  });

  it('offers the phone’s files as well as the camera for a paper that may be a PDF', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          kindCode: NOC_KIND.code,
          titleEn: NOC_KIND.titleEn,
          titleHi: NOC_KIND.titleHi,
          periodKind: 'NONE',
          periodKey: '',
        }),
      ],
    });
    renderPage();

    const todo = screen.getByRole('heading', { level: 2, name: 'Still to do' }).parentElement
      ?.parentElement;
    expect(todo).not.toBeNull();
    expect(within(todo as HTMLElement).getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(
      within(todo as HTMLElement).getByRole('button', { name: 'Choose from phone' }),
    ).toBeInTheDocument();
  });
});

describe('DocumentsPage — the filing cabinet', () => {
  it('lists what MDG holds, with how long each one has left', () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({
      rows: [
        makeOnFileRow({
          id: 'noc',
          validUntil: '2026-09-10',
          validityState: 'expiring',
          daysToExpiry: 8,
        }),
      ],
    });
    renderPage();

    expect(screen.getByText('Fire NOC')).toBeInTheDocument();
    // The COUNT is re-formatted on this phone from the server's number, so a
    // dealer who flipped the language toggle reads their own language. The
    // fixture's `validityLabel` is deliberately nonsense to catch a screen that
    // printed the server's already-formatted copy instead.
    expect(screen.getByText('8 days left')).toBeInTheDocument();
    expect(screen.queryByText('server-said-this')).not.toBeInTheDocument();
  });

  /**
   * An expired paper and one still in force must not read the same. Colour
   * alone would not do it — the reader is 55, outdoors, under a canopy — so
   * each says its own sentence as well.
   */
  it('tells an expired paper apart from a valid one in words, not only colour', () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({
      rows: [
        makeOnFileRow({
          id: 'gone',
          titleEn: 'DTO trade licence',
          titleHi: 'डीटीओ लाइसेंस',
          validUntil: '2026-08-31',
          validityState: 'expired',
          daysToExpiry: -2,
        }),
        makeOnFileRow({ id: 'fine', daysToExpiry: 485 }),
      ],
    });
    renderPage();

    expect(screen.getByText('Expired 2 days ago')).toBeInTheDocument();
    expect(screen.getByText('485 days left')).toBeInTheDocument();
    expect(screen.getByText('Was good until 31 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Good until 31 Dec 2027')).toBeInTheDocument();
  });

  /**
   * A register page does not expire and never will. "Valid until —" on one
   * sends a dealer hunting for a date that was never printed on the thing.
   */
  it('lists a paper with no expiry quietly, with no badge at all', () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({
      rows: [
        makeOnFileRow({
          id: 'page',
          titleEn: "Today's register page",
          titleHi: 'आज के रजिस्टर का पन्ना',
          validUntil: undefined,
          validityState: undefined,
          daysToExpiry: undefined,
        }),
      ],
    });
    renderPage();

    expect(screen.getByText("Today's register page")).toBeInTheDocument();
    expect(screen.queryByText(/Good until/)).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('opens the paper through its own route when the row is tapped', async () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({ rows: [makeOnFileRow({ id: 'filed-noc' })] });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Fire NOC/ }));
    // Presigned at tap time through `/v1/asks/me/:id/file-url`, never through
    // the chat attachment helper — that one answers 403 for anything under
    // `ask/`.
    expect(h.opened).toEqual(['filed-noc']);
  });

  it('says so, calmly, when MDG holds nothing yet', () => {
    h.list = makeAskList({ rows: [] });
    h.onFile = makeOnFileList({ rows: [] });
    renderPage();
    expect(screen.getByText('Nothing on file yet')).toBeInTheDocument();
  });

  /**
   * The cabinet loads on its own clock. A dealer who came here to answer a
   * request must not be shown a spinner instead of the request because 500 rows
   * are still coming down a 2G link.
   */
  it('keeps the request answerable while the cabinet is still loading', () => {
    h.list = makeAskList({ rows: [makeAskRow({ periodKey: TODAY })] });
    h.onFile = undefined;
    h.onFileLoading = true;
    renderPage();

    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
  });
});

describe('DocumentsPage — the renewal already open', () => {
  /** The filed paper and the request for its replacement are one thing. */
  function pair() {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          id: 'renewal-1',
          kindCode: NOC_KIND.code,
          titleEn: NOC_KIND.titleEn,
          titleHi: NOC_KIND.titleHi,
          periodKind: 'NONE',
          periodKey: ':renew-2026-09-10',
        }),
      ],
    });
    h.onFile = makeOnFileList({
      rows: [
        makeOnFileRow({
          id: 'old-noc',
          validUntil: '2026-09-10',
          validityState: 'expiring',
          daysToExpiry: 8,
          renewedByAskId: 'renewal-1',
        }),
      ],
    });
  }

  it('points a lapsing paper at the job instead of leaving the dealer to join it up', () => {
    pair();
    renderPage();
    expect(screen.getByText('MDG has asked you for the new one')).toBeInTheDocument();
  });

  it('puts the request itself in front of the dealer when the strip is tapped', async () => {
    pair();
    const { container } = renderPage();

    await userEvent.click(
      screen.getByRole('button', { name: /MDG has asked you for the new one/ }),
    );

    const ringed = container.querySelector('.ring-2');
    expect(ringed).not.toBeNull();
    expect(ringed?.textContent ?? '').toContain('Fire NOC');
  });

  /**
   * `renewedByAskId` says a renewal WAS opened, not that it is still the
   * dealer's move. A card that kept pointing at a photograph already sent is
   * how one page gets photographed twice.
   */
  it('says nothing once the renewal is with MDG', () => {
    pair();
    const rows = h.list?.rows ?? [];
    h.list = makeAskList({
      rows: rows.map((r) => ({ ...r, state: 'SENT' as const, waitingOn: 'mdg' as const })),
    });
    renderPage();

    expect(screen.queryByText('MDG has asked you for the new one')).not.toBeInTheDocument();
  });
});

describe('DocumentsPage — the link a notification opens', () => {
  /**
   * `/documents?ask=<id>` is built by `services/documents/notify.ts` and the
   * native shell hands the whole string to the WebView untouched, so
   * notifications carrying it are ALREADY ON PHONES. Whatever else changes on
   * this screen, this tap has to keep landing somewhere that makes sense.
   */
  it('scrolls to the paper the notification was about', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({ id: 'other', periodKey: YESTERDAY }),
        makeAskRow({
          id: 'wanted',
          periodKey: TODAY,
          kindCode: NOC_KIND.code,
          titleEn: NOC_KIND.titleEn,
          titleHi: NOC_KIND.titleHi,
        }),
      ],
    });
    const { container } = renderPage('en', '/documents?ask=wanted');

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const ringed = container.querySelector('.ring-2');
    expect(ringed?.textContent ?? '').toContain('Fire NOC');
  });

  /** An `owed` line's id is a label with colons in it, percent-encoded by the server. */
  it('resolves a derived owed line, colons and all', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          id: `owed:tt-register-page:${YESTERDAY}`,
          source: 'owed',
          periodKey: YESTERDAY,
          state: undefined,
        }),
      ],
    });
    const { container } = renderPage(
      'en',
      `/documents?ask=${encodeURIComponent(`owed:tt-register-page:${YESTERDAY}`)}`,
    );

    const ringed = container.querySelector('.ring-2');
    expect(ringed?.textContent ?? '').toContain('Yesterday');
  });

  /**
   * A miss is ordinary: the ask may have been withdrawn, or answered from the
   * other phone at this outlet since the notification went out. The screen just
   * does not scroll — it must not blank, and it must not say anything is wrong.
   */
  it('still draws the list when the ask has gone', () => {
    h.list = makeAskList({ rows: [makeAskRow({ periodKey: TODAY })] });
    const { container } = renderPage('en', '/documents?ask=long-gone');

    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(container.querySelector('.ring-2')).toBeNull();
  });

  /** `/asks` is a second mount of this page, so the parameter has to survive it too. */
  it('answers the same parameter on the app’s own path', () => {
    h.list = makeAskList({ rows: [makeAskRow({ id: 'wanted', periodKey: TODAY })] });
    const { container } = renderPage('en', '/asks?ask=wanted');
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });
});
