import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { TicketDealerView } from '@dk/shared/types';

import { TicketBar } from './TicketBar';

function ticket(over: Partial<TicketDealerView> = {}): TicketDealerView {
  return {
    id: 't1',
    number: 3,
    state: 'OPEN',
    seen: false,
    raisedAt: '2026-10-30T04:00:00.000Z',
    ...over,
  };
}

/** A moment on the IST wall clock: `ist(30, 15, 30)` is 15:30 on 30 Oct 2026 in India. */
function ist(day: number, hour: number, minute = 0, second = 0): Date {
  return new Date(Date.UTC(2026, 9, day, hour, minute, second) - 330 * 60_000);
}

const HOUR = 3_600_000;
const MIN = 60_000;

const bar = () => document.querySelector('[data-ticket-bar]');
const text = () => bar()?.textContent ?? null;

/**
 * Only the clock and the timer are faked; everything else stays real. Nothing
 * here waits on a server: the bar is handed its tickets, as the chat page hands
 * it the conversation's.
 */
function clockAt(at: Date) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(at);
}

function tab(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
});
afterEach(() => {
  // Unmount first: resetting the language below would otherwise re-render a bar
  // that is still on screen, outside any `act`.
  cleanup();
  vi.useRealTimers();
  // Back to jsdom's own `visibilityState`.
  delete (document as { visibilityState?: unknown }).visibilityState;
  resetStores();
});

describe('TicketBar — what it draws', () => {
  it('is one quiet line of text: not a button, not a link', () => {
    clockAt(ist(30, 15, 30));
    render(<TicketBar tickets={[ticket({ seen: true })]} />);
    expect(text()).toBe('#3 · MDG team is looking at it');
    expect(bar()).toHaveAttribute('role', 'status');
    expect(bar()!.querySelector('button, a, [role="button"]')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('wears the header’s own colours and sits as one row that does not shrink', () => {
    clockAt(ist(30, 15, 30));
    render(<TicketBar tickets={[ticket({ seen: true })]} />);
    expect(bar()).toHaveClass('shrink-0', 'bg-wa-bar', 'border-b', 'border-wa-divider');
    // Words may wrap at a narrow phone width; they are never cut off with "…".
    expect(bar()!.className).not.toMatch(/truncate|whitespace-nowrap/);
    expect(bar()!.firstElementChild).toHaveClass('break-words');
  });

  it('draws nothing for no tickets, an empty list, or a server that never sent the field', () => {
    clockAt(ist(30, 15, 30));
    const view = render(<TicketBar tickets={undefined} />);
    expect(bar()).toBeNull();
    view.rerender(<TicketBar tickets={[]} />);
    expect(bar()).toBeNull();
  });

  it.each([
    ['new', {}, 'en', '#3 · Sent to the MDG team'],
    ['new', {}, 'hi', '#3 · MDG टीम को भेज दिया है'],
    ['looking', { seen: true }, 'en', '#3 · MDG team is looking at it'],
    ['looking', { seen: true }, 'hi', '#3 · MDG टीम देख रही है'],
    [
      'working',
      { seen: true, promiseUntil: ist(30, 18).toISOString() },
      'en',
      '#3 · Being worked on · update by 6:00 pm',
    ],
    [
      'working',
      { seen: true, promiseUntil: ist(30, 18).toISOString() },
      'hi',
      '#3 · काम चल रहा है · आज शाम 6 बजे तक अपडेट',
    ],
    [
      'late',
      { seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: true },
      'en',
      '#3 · Taking a little longer · team reminded',
    ],
    [
      'late',
      { seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: true },
      'hi',
      '#3 · थोड़ा और समय लग रहा है · टीम को याद दिलाया',
    ],
    [
      'closed',
      { state: 'RESOLVED', seen: true, resolvedAt: ist(30, 14, 30).toISOString() },
      'en',
      '#3 · Done ✓',
    ],
    [
      'closed',
      { state: 'RESOLVED', seen: true, resolvedAt: ist(30, 14, 30).toISOString() },
      'hi',
      '#3 · पूरा हुआ ✓',
    ],
  ] as const)('%s, in %s language', (phase, over, lang, words) => {
    clockAt(ist(30, 15, 30));
    useLangStore.setState({ lang, explicit: true });
    render(<TicketBar tickets={[ticket(over)]} />);
    expect(text()).toBe(words);
    expect(bar()).toHaveAttribute('data-phase', phase);
  });

  it('a promise that ran out with no reminder said reads "looking", not "taking longer"', () => {
    clockAt(ist(30, 15, 30));
    const view = render(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 15).toISOString() })]} />,
    );
    expect(text()).toBe('#3 · MDG team is looking at it');
    expect(bar()).toHaveAttribute('data-phase', 'looking');
    // The same ticket, once the server says the team was reminded.
    view.rerender(
      <TicketBar
        tickets={[ticket({ seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: true })]}
      />,
    );
    expect(text()).toBe('#3 · Taking a little longer · team reminded');
    expect(bar()).toHaveAttribute('data-phase', 'late');
    // And an explicit false is the same as no field.
    view.rerender(
      <TicketBar
        tickets={[ticket({ seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: false })]}
      />,
    );
    expect(bar()).toHaveAttribute('data-phase', 'looking');
  });

  it('night — a ticket raised at 7 am is told the team looks from 9', () => {
    clockAt(ist(30, 7));
    render(<TicketBar tickets={[ticket()]} />);
    expect(text()).toBe('#3 · The team will see this from 9 am');
    expect(bar()).toHaveAttribute('data-phase', 'night');
    act(() => useLangStore.setState({ lang: 'hi', explicit: true }));
    expect(text()).toBe('#3 · टीम सुबह 9 बजे से देखेगी');
  });

  it('follows a language switch in place', () => {
    clockAt(ist(30, 15, 30));
    render(<TicketBar tickets={[ticket({ seen: true })]} />);
    expect(text()).toBe('#3 · MDG team is looking at it');
    act(() => useLangStore.setState({ lang: 'hi', explicit: true }));
    expect(text()).toBe('#3 · MDG टीम देख रही है');
  });

  it('steps aside when asked, and keeps nothing on screen', () => {
    clockAt(ist(30, 15, 30));
    const view = render(<TicketBar tickets={[ticket({ seen: true })]} hidden />);
    expect(bar()).toBeNull();
    view.rerender(<TicketBar tickets={[ticket({ seen: true })]} />);
    expect(text()).toBe('#3 · MDG team is looking at it');
  });

  it('updates in place when the conversation’s ticket changes', () => {
    clockAt(ist(30, 15, 30));
    const view = render(<TicketBar tickets={[ticket()]} />);
    expect(text()).toBe('#3 · Sent to the MDG team');
    view.rerender(<TicketBar tickets={[ticket({ seen: true })]} />);
    expect(text()).toBe('#3 · MDG team is looking at it');
    view.rerender(
      <TicketBar
        tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })]}
      />,
    );
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');
    view.rerender(
      <TicketBar
        tickets={[ticket({ state: 'RESOLVED', seen: true, resolvedAt: ist(30, 15, 29).toISOString() })]}
      />,
    );
    expect(text()).toBe('#3 · Done ✓');
    view.rerender(<TicketBar tickets={[]} />);
    expect(bar()).toBeNull();
  });
});

describe('TicketBar — it changes by itself, nothing is sent to the phone', () => {
  it('a promise running out: "being worked on" becomes "looking" at the moment', () => {
    clockAt(ist(30, 15, 30));
    render(<TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })]} />);
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');

    act(() => {
      vi.advanceTimersByTime(2.5 * HOUR - MIN);
    });
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');

    act(() => {
      vi.advanceTimersByTime(MIN);
    });
    // Nothing says the team was reminded yet, so the bar does not claim it.
    expect(text()).toBe('#3 · MDG team is looking at it');
    expect(bar()).toHaveAttribute('data-phase', 'looking');
  });

  it('a promise running out, with the team already reminded: it becomes "taking longer" at the moment', () => {
    clockAt(ist(30, 15, 30));
    render(
      <TicketBar
        tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString(), teamReminded: true })]}
      />,
    );
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');

    act(() => {
      vi.advanceTimersByTime(2.5 * HOUR - MIN);
    });
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');

    act(() => {
      vi.advanceTimersByTime(MIN);
    });
    expect(text()).toBe('#3 · Taking a little longer · team reminded');
    expect(bar()).toHaveAttribute('data-phase', 'late');
  });

  it('"taking longer" arrives when the server says the team was reminded, with no clock change', () => {
    clockAt(ist(30, 18, 5));
    const view = render(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })]} />,
    );
    expect(bar()).toHaveAttribute('data-phase', 'looking');
    // Ten minutes on, the team's reminder goes out and the conversation updates.
    vi.setSystemTime(ist(30, 18, 10));
    view.rerender(
      <TicketBar
        tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString(), teamReminded: true })]}
      />,
    );
    expect(text()).toBe('#3 · Taking a little longer · team reminded');
    expect(bar()).toHaveAttribute('data-phase', 'late');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a promise that was kept (the team wrote since) goes back to "looking", not "taking longer"', () => {
    clockAt(ist(30, 15, 30));
    render(
      <TicketBar
        tickets={[
          ticket({
            seen: true,
            promiseUntil: ist(30, 18).toISOString(),
            teamReminded: true,
            updatedAfterPromise: true,
          }),
        ]}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2.5 * HOUR);
    });
    expect(text()).toBe('#3 · MDG team is looking at it');
  });

  it('team hours starting: "from 9 am" becomes "sent" at 9:00', () => {
    clockAt(ist(30, 8, 59, 30));
    render(<TicketBar tickets={[ticket()]} />);
    expect(text()).toBe('#3 · The team will see this from 9 am');

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(text()).toBe('#3 · The team will see this from 9 am');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(text()).toBe('#3 · Sent to the MDG team');
    expect(bar()).toHaveAttribute('data-phase', 'new');
  });

  it('team hours ending: "sent" becomes "from 9 am" at 11 pm', () => {
    clockAt(ist(30, 22, 59, 30));
    render(<TicketBar tickets={[ticket()]} />);
    expect(text()).toBe('#3 · Sent to the MDG team');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(text()).toBe('#3 · The team will see this from 9 am');
  });

  it('keeps flipping: through the night, and into the morning', () => {
    clockAt(ist(30, 22, 0));
    render(<TicketBar tickets={[ticket()]} />);
    expect(bar()).toHaveAttribute('data-phase', 'new');
    act(() => {
      vi.advanceTimersByTime(HOUR);
    });
    expect(bar()).toHaveAttribute('data-phase', 'night');
    act(() => {
      vi.advanceTimersByTime(10 * HOUR - 1);
    });
    expect(bar()).toHaveAttribute('data-phase', 'night');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bar()).toHaveAttribute('data-phase', 'new');
  });

  it('the closed window: "Done ✓" stays for the full 24 hours, then goes', () => {
    clockAt(ist(30, 14, 0));
    render(
      <TicketBar
        tickets={[ticket({ state: 'RESOLVED', seen: true, resolvedAt: ist(30, 9).toISOString() })]}
      />,
    );
    expect(text()).toBe('#3 · Done ✓');

    // 19 hours after it was closed: still there.
    act(() => {
      vi.advanceTimersByTime(14 * HOUR);
    });
    expect(text()).toBe('#3 · Done ✓');

    // Exactly 24 hours: the window includes its last moment.
    act(() => {
      vi.advanceTimersByTime(5 * HOUR);
    });
    expect(text()).toBe('#3 · Done ✓');

    // One millisecond more: gone.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bar()).toBeNull();
  });

  it('"tomorrow 10:00 am" stops saying tomorrow when India’s midnight passes', () => {
    clockAt(ist(30, 23, 30));
    render(<TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(31, 10).toISOString() })]} />);
    expect(text()).toBe('#3 · Being worked on · update by tomorrow 10:00 am');
    act(() => {
      vi.advanceTimersByTime(30 * MIN);
    });
    expect(text()).toBe('#3 · Being worked on · update by 10:00 am');
    // And it is still being worked on at 10 — one more timer, for the promise itself.
    act(() => {
      vi.advanceTimersByTime(10 * HOUR);
    });
    expect(bar()).toHaveAttribute('data-phase', 'looking');
  });

  it('a change from the server restarts the wait: the old time no longer flips it', () => {
    clockAt(ist(30, 15, 30));
    const view = render(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 16).toISOString() })]} />,
    );
    // The team sets a later time before the first one runs out.
    view.rerender(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 20).toISOString() })]} />,
    );
    act(() => {
      vi.advanceTimersByTime(HOUR);
    });
    expect(text()).toBe('#3 · Being worked on · update by 8:00 pm');
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(3 * HOUR + 30 * MIN);
    });
    expect(bar()).toHaveAttribute('data-phase', 'looking');
  });

  it('sets no timer for a bar only the server can change', () => {
    clockAt(ist(30, 15, 30));
    const view = render(<TicketBar tickets={[ticket({ seen: true })]} />);
    expect(vi.getTimerCount()).toBe(0);
    // A promise that has already run out: what comes next waits for the team.
    view.rerender(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 15).toISOString() })]} />,
    );
    expect(vi.getTimerCount()).toBe(0);
    // …and "taking longer", once the server says the team was reminded, sets none either.
    view.rerender(
      <TicketBar
        tickets={[ticket({ seen: true, promiseUntil: ist(30, 15).toISOString(), teamReminded: true })]}
      />,
    );
    expect(vi.getTimerCount()).toBe(0);
    // And once a promise flips by itself, there is nothing left to wait for.
    view.rerender(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 16).toISOString() })]} />,
    );
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(30 * MIN);
    });
    expect(bar()).toHaveAttribute('data-phase', 'looking');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a hidden bar still keeps time, so it is right when it comes back', () => {
    clockAt(ist(30, 15, 30));
    const tickets = [ticket({ seen: true, promiseUntil: ist(30, 16).toISOString() })];
    const view = render(<TicketBar tickets={tickets} hidden />);
    act(() => {
      vi.advanceTimersByTime(HOUR);
    });
    view.rerender(<TicketBar tickets={tickets} />);
    expect(bar()).toHaveAttribute('data-phase', 'looking');
  });

  it('clears its timer and its listener when the chat is left', () => {
    clockAt(ist(30, 15, 30));
    const remove = vi.spyOn(document, 'removeEventListener');
    const view = render(
      <TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })]} />,
    );
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('TicketBar — a phone that slept past the time', () => {
  it('works the bar out again the moment the screen is back', () => {
    clockAt(ist(30, 15, 30));
    render(<TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })]} />);
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');

    // The phone sleeps and its timers do not run: the clock jumps, no timer fires.
    vi.setSystemTime(ist(30, 19));
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');

    tab('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(text()).toBe('#3 · MDG team is looking at it');
  });

  it('also catches the team’s hours and the closed window', () => {
    clockAt(ist(30, 8, 0));
    const view = render(<TicketBar tickets={[ticket()]} />);
    expect(bar()).toHaveAttribute('data-phase', 'night');
    vi.setSystemTime(ist(30, 10));
    tab('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(bar()).toHaveAttribute('data-phase', 'new');
    view.unmount();

    clockAt(ist(30, 9));
    render(
      <TicketBar
        tickets={[ticket({ state: 'RESOLVED', seen: true, resolvedAt: ist(30, 8).toISOString() })]}
      />,
    );
    expect(text()).toBe('#3 · Done ✓');
    vi.setSystemTime(ist(31, 12));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(bar()).toBeNull();
  });

  it('ignores the screen going away: only coming back matters', () => {
    clockAt(ist(30, 15, 30));
    render(<TicketBar tickets={[ticket({ seen: true, promiseUntil: ist(30, 18).toISOString() })]} />);
    vi.setSystemTime(ist(30, 19));
    tab('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(text()).toBe('#3 · Being worked on · update by 6:00 pm');
  });

  it('listens for none of it in a chat with no ticket', () => {
    clockAt(ist(30, 15, 30));
    const add = vi.spyOn(document, 'addEventListener');
    render(<TicketBar tickets={[]} />);
    expect(add).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
