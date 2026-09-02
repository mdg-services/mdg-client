import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AsksModule from '@/hooks/api/useAsks';
import { useAskQueueStore, type QueuedAskPhoto } from '@/store/askQueue';
import { useLangStore } from '@/store/lang';
import { NOC_KIND, TODAY, YESTERDAY, makeAskList, makeAskRow } from '@/test/askFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerDocumentAskList } from '@dk/shared/types';

/**
 * The dealer's own list of papers.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is the one about dates: not a single
 * `2026-09-02` may reach the screen, in either language, from a period key or
 * from a due date. Everything a dealer reads here is either words or a number
 * with a month beside it, and the only thing allowed to produce either is
 * `documentPeriodLabel` from `shared`.
 */

const h = vi.hoisted(() => ({ list: undefined as DealerDocumentAskList | undefined }));

vi.mock('@/hooks/api/useAsks', async (orig) => {
  const actual = await orig<typeof AsksModule>();
  return {
    ...actual,
    useMyAsks: () => ({ data: h.list, isLoading: false, isError: false }),
    useAskListSocket: () => undefined,
  };
});

const { AsksPage } = await import('./AsksPage');

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

function renderPage(lang: 'en' | 'hi' = 'en') {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/asks" element={<AsksPage />} />
      <Route path="/kavach" element={<div>kavach-page</div>} />
    </Routes>,
    { route: '/asks', withRouter: true },
  );
}

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  resetStores();
  useAskQueueStore.setState({ items: [] });
  h.list = undefined;
  vi.restoreAllMocks();
});

describe('AsksPage — grouped by whose turn it is', () => {
  it('puts what the dealer still owes above what is with MDG', () => {
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
    expect(headings).toEqual(['Still to do', 'Sent', 'Done']);
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

describe('AsksPage — no raw dates, ever', () => {
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
});

describe('AsksPage — what a card offers', () => {
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

    const todo = screen.getByRole('heading', { level: 2, name: 'Still to do' }).parentElement;
    expect(todo).not.toBeNull();
    expect(within(todo as HTMLElement).getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(
      within(todo as HTMLElement).getByRole('button', { name: 'Choose from phone' }),
    ).toBeInTheDocument();
  });
});
