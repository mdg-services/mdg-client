import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/utils';

// The overlay is tested on its own; here it is a probe that presses each of its buttons.
vi.mock('./ReportOverlay', () => ({
  ReportOverlay: (props: {
    conversationId: string;
    messageId: string;
    placeholder?: { messageId: string };
    onClose: () => void;
    onOpenNewer: (t: { conversationId: string; messageId: string }) => void;
    onSeeInChat: (t: { conversationId: string; messageId: string }) => void;
    onGoToday: () => void;
    onOpenChat: (t: { conversationId: string; messageId?: string; draft?: string }) => void;
    onNavigate: (to: string) => void;
  }) => (
    <div data-testid="overlay" data-cid={props.conversationId} data-mid={props.messageId} data-ph={props.placeholder?.messageId ?? ''}>
      <button onClick={props.onClose}>close</button>
      <button onClick={() => props.onOpenNewer({ conversationId: 'c1', messageId: 'newer' })}>newer</button>
      <button onClick={() => props.onSeeInChat({ conversationId: props.conversationId, messageId: props.messageId })}>chat</button>
      <button onClick={() => props.onSeeInChat({ conversationId: 'c9', messageId: 'z' })}>other-chat</button>
      <button onClick={props.onGoToday}>today</button>
      <button onClick={() => props.onOpenChat({ conversationId: 'c1', messageId: 'box-1' })}>box-here</button>
      <button onClick={() => props.onOpenChat({ conversationId: 'c9', messageId: 'box-9' })}>box-other</button>
      <button onClick={() => props.onOpenChat({ conversationId: 'c1', draft: 'Please order diesel' })}>draft</button>
      <button onClick={() => props.onNavigate('/settings')}>go-settings</button>
    </div>
  ),
}));

const { ReportModal } = await import('./ReportModal');

function Where() {
  const loc = useLocation();
  return <div data-testid="where" data-path={loc.pathname} data-state={JSON.stringify(loc.state)} />;
}

function Host({ onJumpTo, onCloseSpy }: { onJumpTo?: (id: string) => void; onCloseSpy?: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      {open ? (
        <ReportModal
          conversationId="c1"
          messageId="m1"
          placeholder={{ messageId: 'm1' } as never}
          onClose={() => {
            onCloseSpy?.();
            setOpen(false);
          }}
          onJumpTo={onJumpTo}
        />
      ) : null}
    </>
  );
}

const renderHost = (props: React.ComponentProps<typeof Host> = {}) =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="*" element={<Host {...props} />} />
      </Routes>
      <Where />
    </>,
    { route: '/chat/c1' },
  );

afterEach(cleanup);

describe('the report inside the thread (the extension\'s panel)', () => {
  it('is drawn on top of the page, outside the thread, with the held row as its first frame', () => {
    const { container } = renderHost();
    const overlay = screen.getByTestId('overlay');
    expect(overlay).toHaveAttribute('data-mid', 'm1');
    expect(overlay).toHaveAttribute('data-ph', 'm1');
    // A portal: the thread's own tree does not contain it.
    expect(container.contains(overlay)).toBe(false);
    expect(document.body.contains(overlay)).toBe(true);
  });

  it('closes from its Close button', () => {
    const spy = vi.fn();
    renderHost({ onCloseSpy: spy });
    fireEvent.click(screen.getByText('close'));
    expect(spy).toHaveBeenCalled();
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('closes from the phone\'s Back: it owns one history entry, like every other sheet', async () => {
    const before = window.history.length;
    renderHost();
    expect(window.history.length).toBe(before + 1);
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('"See newer" swaps the content in place, with no navigation and no stale first frame', () => {
    renderHost();
    fireEvent.click(screen.getByText('newer'));
    const overlay = screen.getByTestId('overlay');
    expect(overlay).toHaveAttribute('data-mid', 'newer');
    expect(overlay).toHaveAttribute('data-ph', '');
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
  });

  it('"See in chat" closes it and scrolls the thread to the message', async () => {
    const onJumpTo = vi.fn();
    renderHost({ onJumpTo });
    fireEvent.click(screen.getByText('chat'));
    await vi.waitFor(() => expect(onJumpTo).toHaveBeenCalledWith('m1'));
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('opens the other chat when the report lives in one, since this thread cannot show it', async () => {
    const onJumpTo = vi.fn();
    renderHost({ onJumpTo });
    fireEvent.click(screen.getByText('other-chat'));
    await vi.waitFor(() => expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c9'));
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ jumpToMessageId: 'z' });
    expect(onJumpTo).not.toHaveBeenCalled();
  });

  it('"Today\'s page" has nowhere to go in the panel: it just closes', () => {
    renderHost();
    fireEvent.click(screen.getByText('today'));
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('a box in this thread: closes and scrolls the thread to that exact message', async () => {
    const onJumpTo = vi.fn();
    renderHost({ onJumpTo });
    fireEvent.click(screen.getByText('box-here'));
    await vi.waitFor(() => expect(onJumpTo).toHaveBeenCalledWith('box-1'));
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('a box in the other chat: opens that chat at the box', async () => {
    renderHost({ onJumpTo: vi.fn() });
    fireEvent.click(screen.getByText('box-other'));
    await vi.waitFor(() => expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c9'));
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ jumpToMessageId: 'box-9' });
  });

  it('a sentence to type: closes and hands the chat the draft, unsent', async () => {
    const onJumpTo = vi.fn();
    renderHost({ onJumpTo });
    fireEvent.click(screen.getByText('draft'));
    await vi.waitFor(() => expect(screen.queryByTestId('overlay')).toBeNull());
    await vi.waitFor(() =>
      expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ draftText: 'Please order diesel' }),
    );
    expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/chat/c1');
    expect(onJumpTo).not.toHaveBeenCalled();
  });

  it('an address a button names: closes first, then goes there', async () => {
    renderHost();
    fireEvent.click(screen.getByText('go-settings'));
    await vi.waitFor(() => expect(screen.getByTestId('where')).toHaveAttribute('data-path', '/settings'));
    expect(screen.queryByTestId('overlay')).toBeNull();
  });
});
