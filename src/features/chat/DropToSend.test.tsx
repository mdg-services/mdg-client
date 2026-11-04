import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NothingToSendError } from '@/hooks/api/useSendMessage';
import { installTouchGuards } from '@/lib/touchGuards';
import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';

import type { SendBatch } from './dropFiles';
import { DropToSend } from './DropToSend';

// The document-wide "ignore drops" guard is part of the page the chat lives in: the drop
// has to keep working with it installed, exactly as in the app.
beforeAll(() => installTouchGuards());
beforeEach(() => useLangStore.setState({ lang: 'en', explicit: true }));
// Unmount before the shared reset puts the language back to Hindi under a mounted screen.
afterEach(() => cleanup());

const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

/** What a browser puts in a drop of plain files. */
function dropOf(files: File[]) {
  return {
    types: ['Files'],
    files,
    items: files.map((f) => ({
      kind: 'file',
      webkitGetAsEntry: () => null,
      getAsFile: () => f,
    })),
  };
}

/** A dropped folder: one entry, whose reader lists the files. */
function folderDrop(name: string, files: File[]) {
  const entries = files.map((f) => ({
    isFile: true,
    isDirectory: false,
    name: f.name,
    fullPath: `/${name}/${f.name}`,
    file: (ok: (f: File) => void) => ok(f),
  }));
  let given = false;
  const folder = {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    createReader: () => ({
      readEntries: (ok: (e: unknown[]) => void) => {
        ok(given ? [] : entries);
        given = true;
      },
    }),
  };
  return {
    types: ['Files'],
    files: [new File([], name)],
    items: [{ kind: 'file', webkitGetAsEntry: () => folder, getAsFile: () => new File([], name) }],
  };
}

/** A send that uploads everything at once and posts. */
function sendAll(): ReturnType<typeof vi.fn<SendBatch>> {
  return vi.fn<SendBatch>(async (files, hooks) => {
    for (const f of files) hooks.onFileUploaded(f);
  });
}

function setup(send: SendBatch, props: { disabled?: boolean; threadId?: string } = {}) {
  const ui = (p: { disabled?: boolean; threadId?: string }) => (
    <DropToSend send={send} threadId={p.threadId ?? 'c1'} disabled={p.disabled}>
      <div data-testid="conversation">
        <button type="button">inside</button>
      </div>
    </DropToSend>
  );
  const view = renderWithProviders(ui(props));
  return {
    zone: screen.getByTestId('conversation').parentElement as HTMLElement,
    rerender: (p: { disabled?: boolean; threadId?: string }) => view.rerender(ui(p)),
  };
}

describe('the "Drop to send" layer', () => {
  it('shows while files are dragged over the conversation, and goes when they leave', () => {
    const { zone } = setup(sendAll());
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(screen.getByText('Drop to send')).toBeInTheDocument();
    fireEvent.dragLeave(zone, { dataTransfer: { types: ['Files'] } });
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
  });

  it('stays up while the pointer crosses the things inside, which enter and leave in turn', () => {
    const { zone } = setup(sendAll());
    const inner = screen.getByText('inside');
    const files = { dataTransfer: { types: ['Files'] } };
    fireEvent.dragEnter(zone, files);
    fireEvent.dragEnter(inner, files);
    fireEvent.dragLeave(zone, files);
    expect(screen.getByText('Drop to send')).toBeInTheDocument();
    fireEvent.dragLeave(inner, files);
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
  });

  it('is not raised by a dragged piece of text or a link', () => {
    const { zone } = setup(sendAll());
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'] } });
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
  });

  it('is not raised where there is no thread to send into', () => {
    const { zone } = setup(sendAll(), { disabled: true });
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: dropOf([photo('a.jpg')]) });
  });

  it('allows the drop: dragging over it is cancelled the way a drop target must, and shows "copy"', () => {
    const { zone } = setup(sendAll());
    const dataTransfer = { types: ['Files'], dropEffect: 'none' };
    const notCancelled = fireEvent.dragOver(zone, { dataTransfer });
    expect(notCancelled).toBe(false);
    expect(dataTransfer.dropEffect).toBe('copy');
  });
});

describe('dropping files', () => {
  it('sends 25 files as messages of 10, 10 and 5, and says so when done', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    const files = Array.from({ length: 25 }, (_, i) => photo(`p${i}.jpg`));
    fireEvent.drop(zone, { dataTransfer: dropOf(files) });

    expect(await screen.findByText('Sent 25 files')).toBeInTheDocument();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([10, 10, 5]);
    // What the chat's own send is given: a photo as a photo, with the type resolved.
    expect(send.mock.calls[0]?.[0][0]).toMatchObject({
      kind: 'image',
      contentType: 'image/jpeg',
    });
    // Nothing was wrong, so no card is left behind.
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
  });

  it('shows how far it has got, and the Cancel button, while it sends', async () => {
    let release: () => void = () => undefined;
    const send = vi.fn<SendBatch>((files, hooks) => {
      for (const f of files) hooks.onFileUploaded(f);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const { zone } = setup(send);
    fireEvent.drop(zone, {
      dataTransfer: dropOf(Array.from({ length: 12 }, (_, i) => photo(`p${i}.jpg`))),
    });

    expect(await screen.findByText('Sending files: 10 of 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it('works with the document-wide guard in place (it cancels the browser\'s own handling only)', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    const notPrevented = fireEvent.drop(zone, { dataTransfer: dropOf([photo('a.jpg')]) });
    // The guard had its say first, in the capture phase; the drop was still heard.
    expect(notPrevented).toBe(false);
    expect(await screen.findByText('Sent 1 file')).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('walks a dropped folder, and lists what it set aside with the reason', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 });
    fireEvent.drop(zone, {
      dataTransfer: folderDrop('Slips', [
        photo('one.jpg'),
        new File(['x'], 'old.doc', { type: 'application/msword' }),
        big,
        new File([], 'empty.pdf', { type: 'application/pdf' }),
        new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
      ]),
    });

    expect(await screen.findByText('Sent 1 of 1')).toBeInTheDocument();
    expect(send.mock.calls[0]?.[0].map((f) => f.file.name)).toEqual(['one.jpg']);
    const card = screen.getByText('Sent 1 of 1').parentElement as HTMLElement;
    expect(card).toHaveTextContent('Slips/old.doc');
    expect(card).toHaveTextContent('Slips/big.pdf');
    expect(card).toHaveTextContent('Bigger than 25 MB');
    expect(card).toHaveTextContent('Slips/empty.pdf');
    expect(card).toHaveTextContent('The file is empty');
    expect(card).toHaveTextContent('Slips/clip.mp4');
    expect(card).toHaveTextContent('This kind of file cannot be sent');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Slips/old.doc')).not.toBeInTheDocument();
  });

  it('says so, and sends nothing, when none of what was dropped can be sent', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    fireEvent.drop(zone, {
      dataTransfer: dropOf([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]),
    });
    expect(await screen.findByText('None of these files can be sent.')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('names every file that would not upload, however many, in a list the card scrolls', async () => {
    const send = vi.fn<SendBatch>(async (files, hooks) => {
      for (const f of files) hooks.onFileFailed(f);
      throw new NothingToSendError();
    });
    const { zone } = setup(send);
    fireEvent.drop(zone, {
      dataTransfer: dropOf(Array.from({ length: 9 }, (_, i) => photo(`p${i}.jpg`))),
    });
    expect(await screen.findByText('Sent 0 of 9')).toBeInTheDocument();
    expect(screen.getAllByText(/Did not go through/)).toHaveLength(9);
    expect(screen.getByText('p8.jpg')).toBeInTheDocument();
    expect(screen.queryByText(/and \d+ more/)).not.toBeInTheDocument();
    // The names scroll inside the card, and Dismiss stays outside the scrolling part.
    const list = screen.getByText('p0.jpg').closest('ul') as HTMLElement;
    expect(list).toHaveClass('overflow-y-auto');
    expect(list).not.toContainElement(screen.getByRole('button', { name: 'Dismiss' }));
  });

  it('names a hundred skipped files from a big folder, each with its reason', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    const clips = Array.from(
      { length: 100 },
      (_, i) => new File(['x'], `c${i}.mp4`, { type: 'video/mp4' }),
    );
    fireEvent.drop(zone, {
      dataTransfer: folderDrop('Mixed', [...clips, photo('keep.jpg')]),
    });
    expect(await screen.findByText('Sent 1 of 1')).toBeInTheDocument();
    expect(screen.getAllByText(/This kind of file cannot be sent/)).toHaveLength(100);
    expect(screen.getByText('Mixed/c99.mp4')).toBeInTheDocument();
  });

  it('shows "Reading the files…" while a big folder is being walked, so the drop is not ignored', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    // A folder whose reader answers only when told to.
    let answer: (entries: unknown[]) => void = () => {};
    const entry = {
      isFile: true,
      isDirectory: false,
      name: 'a.jpg',
      fullPath: '/Slow/a.jpg',
      file: (ok: (f: File) => void) => ok(photo('a.jpg')),
    };
    let given = false;
    const folder = {
      isFile: false,
      isDirectory: true,
      name: 'Slow',
      fullPath: '/Slow',
      createReader: () => ({
        readEntries: (ok: (e: unknown[]) => void) => {
          if (given) ok([]);
          else {
            given = true;
            answer = ok;
          }
        },
      }),
    };
    fireEvent.drop(zone, {
      dataTransfer: {
        types: ['Files'],
        files: [new File([], 'Slow')],
        items: [{ kind: 'file', webkitGetAsEntry: () => folder, getAsFile: () => null }],
      },
    });
    expect(await screen.findByText('Reading the files…')).toBeInTheDocument();

    // A second drop meanwhile is told what is going on, not that files are "being sent".
    fireEvent.drop(zone, { dataTransfer: dropOf([photo('b.jpg')]) });
    expect(
      await screen.findByText('Still reading the files you dropped. Wait a moment.'),
    ).toBeInTheDocument();

    await act(async () => answer([entry]));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Reading the files…')).not.toBeInTheDocument();
  });

  it('says only the first 200 were read when a folder held more', async () => {
    const send = sendAll();
    const { zone } = setup(send);
    fireEvent.drop(zone, {
      dataTransfer: folderDrop(
        'Archive',
        Array.from({ length: 205 }, (_, i) => photo(`p${i}.jpg`)),
      ),
    });
    expect(await screen.findByText('Sent 200 of 200')).toBeInTheDocument();
    expect(
      screen.getByText('Only the first 200 files were read. Drop the rest again.'),
    ).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(20);
  });
});

describe('Cancel, a second drop, and leaving', () => {
  /** A send that waits to be told to finish, so the card can be looked at and pressed. */
  function slowSend() {
    const waiting: Array<() => void> = [];
    const send = vi.fn<SendBatch>(
      (files, hooks) =>
        new Promise<void>((resolve) => {
          waiting.push(() => {
            for (const f of files) {
              if (hooks.shouldStop()) break;
              hooks.onFileUploaded(f);
            }
            resolve();
          });
        }),
    );
    return { send, finishOne: () => waiting.shift()?.() };
  }

  it('stops after the file being sent, sends what is up, and says how many went', async () => {
    const { send, finishOne } = slowSend();
    const { zone } = setup(send);
    fireEvent.drop(zone, {
      dataTransfer: dropOf(Array.from({ length: 25 }, (_, i) => photo(`p${i}.jpg`))),
    });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Stopping…')).toBeInTheDocument();
    await act(async () => finishOne());

    expect(await screen.findByText('Stopped. Sent 0 of 25.')).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('turns away a second drop while one is being sent, and says why', async () => {
    const { send } = slowSend();
    const { zone } = setup(send);
    fireEvent.drop(zone, { dataTransfer: dropOf([photo('a.jpg')]) });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    fireEvent.drop(zone, { dataTransfer: dropOf([photo('b.jpg')]) });
    expect(await screen.findByText('Files are still being sent. Wait, or press Cancel.')).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not raise the layer while one is being sent', async () => {
    const { send } = slowSend();
    const { zone } = setup(send);
    fireEvent.drop(zone, { dataTransfer: dropOf([photo('a.jpg')]) });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(screen.queryByText('Drop to send')).not.toBeInTheDocument();
  });

  it('stops, and clears its card, when the screen moves to another thread', async () => {
    const { send, finishOne } = slowSend();
    const { zone, rerender } = setup(send);
    fireEvent.drop(zone, {
      dataTransfer: dropOf(Array.from({ length: 25 }, (_, i) => photo(`p${i}.jpg`))),
    });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Sending/)).toBeInTheDocument();

    rerender({ threadId: 'c2' });
    expect(screen.queryByText(/Sending/)).not.toBeInTheDocument();
    await act(async () => finishOne());
    // Nothing more goes, and nothing is shown, for the thread that was left.
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Stopped/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sent/)).not.toBeInTheDocument();
  });
});
