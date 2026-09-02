import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui';
import { useAskQueueStore } from '@/store/askQueue';
import { useLangStore } from '@/store/lang';
import { TODAY, YESTERDAY, makeAskList, makeAskRow } from '@/test/askFixtures';
import { resetStores, signIn } from '@/test/utils';

import { AskSheet } from './AskSheet';

/**
 * The one screen between the camera and MDG having the paper.
 *
 * Two things are being defended here and they are not the same thing.
 *
 * THE DATE. A `2026-09-02` must never reach a forecourt owner, and the day has
 * to be on the button the thumb presses, not only in the sentence above it.
 *
 * THE DIALOG. None of the app's six existing sheets has a role, an `aria-modal`,
 * a focus move, a focus restore or an Escape. This one has all five, and each is
 * asserted separately because each fails on its own — a sheet with a role but no
 * focus restore still leaves a keyboard user at the top of the app.
 */

/** jsdom implements none of these, and the sheet reaches for all three. */
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  // `useScrollLock` restores the page scroll on close.
  window.scrollTo = vi.fn();
});

afterEach(() => {
  resetStores();
  useAskQueueStore.setState({ items: [] });
  vi.restoreAllMocks();
});

function photo(name = 'page.jpg'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

/**
 * The sheet, with a button outside it that opened it — so "focus went back to
 * where it came from" is a thing this file can actually assert.
 */
function Harness({
  row = makeAskRow(),
  rows = [makeAskRow()],
  onQueued = vi.fn(),
}: {
  row?: ReturnType<typeof makeAskRow>;
  rows?: ReturnType<typeof makeAskRow>[];
  onQueued?: (r: ReturnType<typeof makeAskRow>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <ToastProvider>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open ? (
        <AskSheet
          list={makeAskList({ rows })}
          row={row}
          file={photo()}
          contentType="image/jpeg"
          kind="image"
          onClose={() => setOpen(false)}
          onRetake={vi.fn()}
          onQueued={onQueued}
        />
      ) : null}
    </ToastProvider>
  );
}

function signedIn(lang: 'en' | 'hi' = 'en') {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
}

describe('AskSheet — the day is a sentence you can refuse', () => {
  it('names the day in words, and never as a date', async () => {
    signedIn();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('This photo will be sent as the paper for Today. Is that right?');
    expect(dialog.textContent ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  /**
   * `DensityTodayCard` already put the day on the button, and that is kept: the
   * button is the last thing read before a photograph is committed to a date.
   */
  it('carries the day on the button the thumb actually presses', async () => {
    signedIn();
    render(<Harness row={makeAskRow({ periodKey: YESTERDAY })} />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));

    expect(await screen.findByRole('button', { name: 'Send as Yesterday' })).toBeInTheDocument();
  });

  it('says all of it in Hindi for a Hindi dealer', async () => {
    signedIn('hi');
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('इस फोटो को आज के काग़ज़ के तौर पर भेजा जाएगा। सही है?');
    expect(screen.getByRole('button', { name: 'आज की फोटो भेजें' })).toBeInTheDocument();
  });

  /** One day on offer is no choice at all, and a button that says so wastes a tap. */
  it('offers another day only when there is one', async () => {
    signedIn();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Choose another day' })).not.toBeInTheDocument();
  });

  it('lets the dealer file the photo against a different day', async () => {
    signedIn();
    const rows = [
      makeAskRow({ id: 'today', periodKey: TODAY }),
      makeAskRow({ id: 'yesterday', periodKey: YESTERDAY }),
    ];
    render(<Harness row={rows[0]} rows={rows} />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Choose another day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yesterday' }));

    expect(screen.getByRole('button', { name: 'Send as Yesterday' })).toBeInTheDocument();
  });
});

describe('AskSheet — it is a real dialog', () => {
  it('announces itself as a modal dialog with a name', async () => {
    signedIn();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Named by the paper it is about, so a screen reader announces something
    // more useful than "dialog".
    expect(dialog).toHaveAccessibleName("Today's register page");
  });

  it('moves focus into the sheet when it opens', async () => {
    signedIn();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveFocus();
  });

  it('closes on Escape', async () => {
    signedIn();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * Without this the dealer who closes the sheet has focus on `<body>`, and the
   * next Tab starts at the top of the app — twelve stops from where they were.
   */
  it('hands focus back to whatever opened it', async () => {
    signedIn();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'opener' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('AskSheet — sending', () => {
  it('puts the photo in the queue rather than holding the dealer on a spinner', async () => {
    signedIn();
    const onQueued = vi.fn();
    render(<Harness onQueued={onQueued} />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send as Today' }));

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(1));
    const item = useAskQueueStore.getState().items[0];
    expect(item).toMatchObject({
      dealerId: 'd1',
      kindCode: 'tt-register-page',
      periodKey: TODAY,
      state: 'queued',
      attempts: 0,
      contentType: 'image/jpeg',
      kind: 'image',
    });
    // The path the answer is posted to comes from the ROW, never composed here.
    expect(item?.submitVia).toBe('/v1/asks/me/ask-2026-09-02/submit');
    // A retry key exists, or a submit that succeeded with a lost response would
    // be refused as a second send.
    expect(item?.clientRef.length).toBeGreaterThanOrEqual(8);
    expect(onQueued).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * An `owed` line has no row anywhere, so there is nothing to presign against
   * and no id to store. The queue mints the row before it uploads.
   */
  it('queues an owed period with no ask id and the volunteer path', async () => {
    signedIn();
    const owed = makeAskRow({
      id: `owed:tt-register-page:${YESTERDAY}`,
      source: 'owed',
      submitVia: '/v1/asks/me/volunteer',
      periodKey: YESTERDAY,
      state: undefined,
    });
    render(<Harness row={owed} rows={[owed]} />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send as Yesterday' }));

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(1));
    const item = useAskQueueStore.getState().items[0];
    expect(item?.askId).toBeUndefined();
    expect(item?.submitVia).toBe('/v1/asks/me/volunteer');
  });

  /** The freeform suffix names the ASK; the server composes it, never a client. */
  it('sends the plain period, not the composed key', async () => {
    signedIn();
    const freeform = makeAskRow({
      id: 'ask-freeform',
      kindCode: 'other-document',
      periodKey: `${TODAY}:bijli-ka-bil`,
      label: 'Electricity bill',
    });
    render(<Harness row={freeform} rows={[freeform]} />);
    await userEvent.click(screen.getByRole('button', { name: 'opener' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send as Today' }));

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(1));
    const item = useAskQueueStore.getState().items[0];
    expect(item?.periodKey).toBe(TODAY);
    expect(item?.label).toBe('Electricity bill');
    // …but the queue still keys on the composed one, so two "other document"
    // asks made on the same day stay two photographs.
    expect(item?.matchKey).toBe(`other-document|${TODAY}:bijli-ka-bil`);
  });
});
