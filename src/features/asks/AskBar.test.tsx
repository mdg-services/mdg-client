import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AsksModule from '@/hooks/api/useAsks';
import { useLangStore } from '@/store/lang';
import { NOC_KIND, OTHER_KIND, TODAY, YESTERDAY, makeAskList, makeAskRow } from '@/test/askFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerDocumentAskList } from '@dk/shared/types';

/**
 * The 44 pixels under the header that say the dealer owes MDG a piece of paper.
 *
 * Everything asserted here is something a person reads or taps, in the language
 * they actually see — not a prop, not a class name. The three faces are the
 * whole product of this bar; its absence is the fourth and is just as important,
 * because a bar that is always there is a bar nobody reads.
 */

const h = vi.hoisted(() => ({ list: undefined as DealerDocumentAskList | undefined }));

// The query and the socket both reach for a network jsdom does not have. The
// RULES — which face, which tap — are the real thing, so a fixture that says
// "one page is owed" produces the same bar a dealer would actually see.
vi.mock('@/hooks/api/useAsks', async (orig) => {
  const actual = await orig<typeof AsksModule>();
  return {
    ...actual,
    useMyAsks: () => ({ data: h.list }),
    useAskListSocket: () => undefined,
  };
});
// The send loop has its own tests; here it would only try to upload.
vi.mock('@/hooks/useAskQueueSync', () => ({
  useAskQueueSync: () => ({ sending: false }),
}));

const { AskBar } = await import('./AskBar');

/**
 * The bar is gone. Asserted as "no button", not as an empty container: the two
 * hidden file inputs and the toast host are always mounted — the inputs because
 * a picker has to exist before the tap that opens it, and both are
 * `display:none`. What a dealer can see or press is the only thing that matters
 * here.
 */
function expectNoBar() {
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
}

function renderBar(route = '/chat') {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/chat" element={<AskBar />} />
      <Route path="/asks" element={<div>asks-page</div>} />
      <Route path="/density" element={<AskBar />} />
    </Routes>,
    { route, withRouter: true },
  );
}

describe('AskBar — the three faces', () => {
  afterEach(() => {
    resetStores();
    h.list = undefined;
  });

  it('says nothing at all when nothing is owed', () => {
    h.list = makeAskList({ rows: [] });
    renderBar();
    expectNoBar();
  });

  /**
   * "Sent, waiting" is MDG's backlog, not the dealer's. A bar about it would be
   * telling them off for our review queue.
   */
  it('says nothing while a paper is sitting with MDG', () => {
    h.list = makeAskList({
      rows: [makeAskRow({ state: 'SENT', waitingOn: 'mdg' })],
    });
    renderBar();
    expectNoBar();
  });

  it('names the one paper that is owed', () => {
    h.list = makeAskList({ rows: [makeAskRow()] });
    renderBar();
    expect(screen.getByRole('button', { name: /Send Today's register page/i })).toBeInTheDocument();
  });

  it('counts them when there is more than one', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({ id: 'a', periodKey: TODAY }),
        makeAskRow({ id: 'b', periodKey: YESTERDAY }),
        makeAskRow({ id: 'c', periodKey: '2026-08-31' }),
      ],
    });
    renderBar();
    expect(screen.getByRole('button', { name: '3 things to send' })).toBeInTheDocument();
  });

  /**
   * The overdue face names the DAY, and it names it in words. A `2026-09-01` on
   * this bar is the exact failure `documentPeriodLabel` exists to prevent.
   */
  it('says which day is overdue, in words and never as a date', () => {
    h.list = makeAskList({ rows: [makeAskRow({ periodKey: YESTERDAY, late: true })] });
    renderBar();
    const bar = screen.getByRole('button', { name: /still due/i });
    expect(bar).toHaveTextContent("Yesterday's paper is still due");
    expect(bar.textContent ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('names an overdue paper that has no day of its own by what it is', () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          kindCode: NOC_KIND.code,
          titleEn: NOC_KIND.titleEn,
          titleHi: NOC_KIND.titleHi,
          periodKind: 'NONE',
          periodKey: '',
          late: true,
        }),
      ],
    });
    renderBar();
    expect(screen.getByRole('button', { name: 'Fire NOC is still due' })).toBeInTheDocument();
  });

  /** The list and /density already say all of this at full size. */
  it('stays off the screen that already shows the same chore', () => {
    h.list = makeAskList({ rows: [makeAskRow()] });
    renderBar('/density');
    expectNoBar();
  });

  /**
   * THE BAR IS STILL THERE AFTER THE TAP, AND THAT IS WHY THIS TEST EXISTS.
   *
   * Every other test here renders the bar INSIDE a route, so a navigation
   * unmounts it and nothing about the second render is ever exercised. The real
   * app mounts it once, in the shell, above the page — so it re-renders on
   * every navigation and must call the same hooks each time.
   *
   * It did not. `useMatch('/asks') || useMatch('/documents')` skipped the
   * second call the moment the first one matched, which took the bar from four
   * hooks to three on the way in and back up to four on the way out. Both
   * directions threw, and the app answered a tap on this bar with "Something
   * didn't load".
   */
  it('survives the walk into the ask list and back out again', async () => {
    h.list = makeAskList({
      rows: [makeAskRow({ id: 'a' }), makeAskRow({ id: 'b', periodKey: YESTERDAY })],
    });
    signIn({ id: 'owner', dealerId: 'd1' });
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <>
        <AskBar />
        <Routes>
          <Route path="/chat" element={<Link to="/asks">go-asks</Link>} />
          <Route path="/asks" element={<Link to="/chat">go-chat</Link>} />
        </Routes>
      </>,
      { route: '/chat', withRouter: true },
    );

    expect(screen.getByRole('button', { name: '2 things to send' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'go-asks' }));
    expectNoBar();
    await userEvent.click(screen.getByRole('link', { name: 'go-chat' }));
    expect(screen.getByRole('button', { name: '2 things to send' })).toBeInTheDocument();
  });

  it('speaks Hindi when the dealer does', () => {
    h.list = makeAskList({ rows: [makeAskRow()] });
    signIn({ id: 'owner', dealerId: 'd1' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<AskBar />, { route: '/chat', withRouter: true });
    expect(screen.getByRole('button', { name: 'आज के रजिस्टर का पन्ना भेजें' })).toBeInTheDocument();
  });
});

describe('AskBar — what a tap does', () => {
  let clicked: string[];

  beforeEach(() => {
    clicked = [];
    // The file input is the only thing worth observing here: whether the bar
    // opened a picker AT ALL is the difference between one tap and three.
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      clicked.push(this.getAttribute('capture') ?? 'files');
    });
  });

  afterEach(() => {
    resetStores();
    h.list = undefined;
    vi.restoreAllMocks();
  });

  /**
   * The whole point of the bar. One outstanding photograph of one page means the
   * dealer's entire job is "take a picture", and the tap on the bar IS the user
   * gesture that lets the picker open — a WebView drops one opened any other
   * way.
   */
  it('opens the camera when there is exactly one page to photograph', async () => {
    h.list = makeAskList({ rows: [makeAskRow()] });
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: /Send Today's register page/i }));
    expect(clicked).toEqual(['environment']);
    expect(screen.queryByText('asks-page')).not.toBeInTheDocument();
  });

  /**
   * MDG's sentence saying what was wrong is the only difference between the
   * second photograph and the first. The camera would skip it.
   */
  it('takes a sent-back paper to the list, not to the camera', async () => {
    h.list = makeAskList({
      rows: [makeAskRow({ state: 'REJECTED', rejectReason: 'The date is cut off.' })],
    });
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: /Send Today's register page/i }));
    expect(clicked).toEqual([]);
    expect(await screen.findByText('asks-page')).toBeInTheDocument();
  });

  it('takes two things to the list, because a bar cannot offer a choice', async () => {
    h.list = makeAskList({
      rows: [makeAskRow({ id: 'a' }), makeAskRow({ id: 'b', periodKey: YESTERDAY })],
    });
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: '2 things to send' }));
    expect(clicked).toEqual([]);
    expect(await screen.findByText('asks-page')).toBeInTheDocument();
  });

  it('takes a paper that might be a PDF to the list', async () => {
    h.list = makeAskList({
      rows: [
        makeAskRow({
          kindCode: OTHER_KIND.code,
          titleEn: OTHER_KIND.titleEn,
          titleHi: OTHER_KIND.titleHi,
          periodKey: `${TODAY}:bijli-ka-bil`,
        }),
      ],
    });
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: /Send A document MDG asked for/i }));
    expect(clicked).toEqual([]);
    expect(await screen.findByText('asks-page')).toBeInTheDocument();
  });
});
