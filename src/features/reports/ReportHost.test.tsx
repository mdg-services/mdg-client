import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTestQueryClient, renderWithProviders } from '@/test/utils';

// The overlay is tested on its own; here it is a probe that presses each of the host's buttons.
type Probe = {
  conversationId: string;
  messageId: string;
  outletHint?: string | undefined;
  onClose: () => void;
  onSeeInChat: (t: { conversationId: string; messageId: string }) => void;
  onOpenChat: (t: { conversationId: string; messageId?: string; draft?: string }) => void;
  onNavigate: (to: string) => void;
};
vi.mock('./ReportOverlay', () => ({
  ReportOverlay: (props: Probe) => (
    <div data-testid="overlay" data-hint={props.outletHint ?? ''}>
      <button onClick={props.onClose}>close</button>
      <button onClick={() => props.onSeeInChat({ conversationId: 'c1', messageId: 'm1' })}>see-in-chat</button>
      <button onClick={() => props.onOpenChat({ conversationId: 'c1', messageId: 'box-1' })}>box</button>
      <button onClick={() => props.onOpenChat({ conversationId: 'c1', draft: 'Please place an order for Diesel 8,000 L' })}>draft</button>
      <button onClick={() => props.onNavigate('/settings')}>go-settings</button>
    </div>
  ),
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ emit: vi.fn() }) }));

const { ReportHost } = await import('./ReportHost');

function Where() {
  const loc = useLocation();
  return <div data-testid="where" data-path={loc.pathname + loc.search} data-state={JSON.stringify(loc.state)} />;
}

function open(entry: string | { pathname: string; state?: unknown } = '/report/c1/m1') {
  const route = typeof entry === 'string' ? entry : entry.pathname;
  const out = renderWithProviders(
    <>
      <Routes>
        <Route path="*" element={<ReportHost />} />
      </Routes>
      <Where />
    </>,
    { route },
  );
  return out;
}

afterEach(cleanup);

describe('the overlay\'s route host', () => {
  it('gives the overlay the pump a link named (?outlet=)', () => {
    open('/report/c1/m1?outlet=15E');
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-hint', '15E');
  });

  it('gives it nothing when the link named no pump, or a pump that is not a plain code', () => {
    open('/report/c1/m1?outlet=%3Cb%3E');
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-hint', '');
  });

  it('a box in the chat, from a screen with no chat beneath: pushes the chat at that exact message', () => {
    open();
    fireEvent.click(screen.getByText('box'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ jumpToMessageId: 'box-1' });
  });

  it('a sentence to type: opens the chat with the draft in the state, not sent', () => {
    open();
    fireEvent.click(screen.getByText('draft'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({
      draftText: 'Please place an order for Diesel 8,000 L',
    });
  });

  it('an address a button names: goes there', () => {
    open();
    fireEvent.click(screen.getByText('go-settings'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/settings');
  });
});

describe('with the chat already beneath the overlay', () => {
  /** [the chat, the report over it]: the opener left the chat in the report entry's state as its background. */
  function overChat(openedFromMessageId?: string) {
    const background = { pathname: '/chat/c1', search: '', hash: '', state: null, key: 'bg' };
    return render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <MemoryRouter
          initialEntries={[
            '/chat/c1',
            { pathname: '/report/c1/m1', state: { backgroundLocation: background, ...(openedFromMessageId ? { openedFromMessageId } : {}) } },
          ]}
          initialIndex={1}
        >
          <Routes>
            <Route path="*" element={<ReportHost />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('a box: closes (pops back to the chat), then replaces that entry so the chat jumps to the box', async () => {
    overChat();
    fireEvent.click(screen.getByText('box'));
    // Closed: the overlay is gone and the chat is what the address says.
    await waitFor(() => expect(screen.queryByTestId('overlay')).toBeNull());
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toBeNull();
    // The history pop lands, and only then is the chat told.
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ jumpToMessageId: 'box-1' });
  });

  it('a sentence to type: the same, with the draft in place of a jump', async () => {
    overChat();
    fireEvent.click(screen.getByText('draft'));
    await waitFor(() => expect(screen.queryByTestId('overlay')).toBeNull());
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({
      draftText: 'Please place an order for Diesel 8,000 L',
    });
  });

  it('does not wait for a pop that never comes: a short timer tells the chat anyway', async () => {
    vi.useFakeTimers();
    try {
      overChat();
      fireEvent.click(screen.getByText('box'));
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ jumpToMessageId: 'box-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('"See in chat" for the message the overlay was opened for: just closes, the chat is already there', async () => {
    overChat('m1');
    fireEvent.click(screen.getByText('see-in-chat'));
    await waitFor(() => expect(screen.queryByTestId('overlay')).toBeNull());
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toBeNull();
  });

  it('"See in chat" after "See newer" (the overlay shows m1, it was opened for m0): the chat is taken to m1', async () => {
    overChat('m0');
    fireEvent.click(screen.getByText('see-in-chat'));
    await waitFor(() => expect(screen.queryByTestId('overlay')).toBeNull());
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ jumpToMessageId: 'm1' });
  });
});
