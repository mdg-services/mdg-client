import { describe, expect, it, vi } from 'vitest';

import { NothingToSendError } from '@/hooks/api/useSendMessage';
import type { OutgoingAttachment } from '@/lib/uploadAttachment';

import {
  MAX_DROP_FILES,
  MAX_UPLOAD_BYTES,
  checkFile,
  chunk,
  readDropped,
  sendInBatches,
  snapshotDrop,
  sortDropped,
  type DropSource,
  type SendBatch,
} from './dropFiles';

/** A file of the given type; `size` is claimed rather than allocated. */
function file(name: string, type = '', size = 100): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** What `webkitGetAsEntry` gives for a file. */
function fileEntry(path: string, f: File = file(base(path)), fails = false): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: base(path),
    fullPath: `/${path}`,
    file: (ok: (f: File) => void, err: (e: unknown) => void) =>
      fails ? err(new Error('gone')) : ok(f),
  } as unknown as FileSystemEntry;
}

/** And for a folder, whose reader hands back `pageSize` entries a call, then an empty list. */
function dirEntry(
  path: string,
  children: FileSystemEntry[],
  opts: { pageSize?: number; fails?: boolean } = {},
): FileSystemEntry {
  const pageSize = opts.pageSize ?? 100;
  return {
    isFile: false,
    isDirectory: true,
    name: base(path),
    fullPath: `/${path}`,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok: (e: FileSystemEntry[]) => void, err: (e: unknown) => void) => {
          if (opts.fails) return err(new Error('denied'));
          const page = children.slice(at, at + pageSize);
          at += pageSize;
          ok(page);
        },
      };
    },
  } as unknown as FileSystemEntry;
}

const source = (entry: FileSystemEntry): DropSource => ({ entry, file: null });

describe('snapshotDrop', () => {
  it('takes the entry and the file of each dragged file, and leaves text alone', () => {
    const entry = fileEntry('a.pdf');
    const f = file('a.pdf', 'application/pdf');
    const dt = {
      items: [
        { kind: 'string', webkitGetAsEntry: () => null, getAsFile: () => null },
        { kind: 'file', webkitGetAsEntry: () => entry, getAsFile: () => f },
      ],
      files: [f],
    } as unknown as DataTransfer;
    expect(snapshotDrop(dt)).toEqual([{ entry, file: f }]);
  });

  it('keeps the plain file where the browser gives no entry', () => {
    const f = file('mail.pdf', 'application/pdf');
    const dt = {
      items: [{ kind: 'file', webkitGetAsEntry: () => null, getAsFile: () => f }],
      files: [f],
    } as unknown as DataTransfer;
    expect(snapshotDrop(dt)).toEqual([{ entry: null, file: f }]);
  });

  it('falls back to the file list when there are no items', () => {
    const f = file('a.jpg', 'image/jpeg');
    expect(snapshotDrop({ files: [f] } as unknown as DataTransfer)).toEqual([
      { entry: null, file: f },
    ]);
  });
});

describe('readDropped', () => {
  it('returns plain files under their own names, in order', async () => {
    const a = file('a.jpg', 'image/jpeg');
    const b = file('b.pdf', 'application/pdf');
    const read = await readDropped([
      { entry: fileEntry('a.jpg', a), file: a },
      { entry: null, file: b },
    ]);
    expect(read.files.map((f) => f.path)).toEqual(['a.jpg', 'b.pdf']);
    expect(read.files[0]?.file).toBe(a);
    expect(read.truncated).toBe(false);
    expect(read.unreadable).toEqual([]);
  });

  it('walks a folder to any depth and keeps the path inside it', async () => {
    const tree = dirEntry('Papers', [
      fileEntry('Papers/one.pdf'),
      dirEntry('Papers/July', [
        fileEntry('Papers/July/two.pdf'),
        dirEntry('Papers/July/Week 1', [fileEntry('Papers/July/Week 1/three.jpg')]),
      ]),
      fileEntry('Papers/four.txt'),
    ]);
    const read = await readDropped([source(tree)]);
    expect(read.files.map((f) => f.path)).toEqual([
      'Papers/one.pdf',
      'Papers/July/two.pdf',
      'Papers/July/Week 1/three.jpg',
      'Papers/four.txt',
    ]);
  });

  it('keeps asking a folder for more until it says it is empty (it answers a page at a time)', async () => {
    const children = Array.from({ length: 7 }, (_, i) => fileEntry(`Slips/s${i}.jpg`));
    const read = await readDropped([source(dirEntry('Slips', children, { pageSize: 3 }))]);
    expect(read.files).toHaveLength(7);
  });

  it('leaves out what the operating system scatters in folders', async () => {
    const tree = dirEntry('Papers', [
      fileEntry('Papers/.DS_Store'),
      fileEntry('Papers/Thumbs.db'),
      fileEntry('Papers/desktop.ini'),
      fileEntry('Papers/~$report.docx'),
      fileEntry('Papers/report.docx'),
    ]);
    const read = await readDropped([source(tree)]);
    expect(read.files.map((f) => f.path)).toEqual(['Papers/report.docx']);
    expect(read.unreadable).toEqual([]);
  });

  it('stops at 200 files and says so', async () => {
    const many = Array.from({ length: 250 }, (_, i) => fileEntry(`Big/f${i}.jpg`));
    const read = await readDropped([source(dirEntry('Big', many, { pageSize: 100 }))]);
    expect(MAX_DROP_FILES).toBe(200);
    expect(read.files).toHaveLength(200);
    expect(read.files[199]?.path).toBe('Big/f199.jpg');
    expect(read.truncated).toBe(true);
  });

  it('does not call exactly 200 files too many', async () => {
    const exactly = Array.from({ length: 200 }, (_, i) => fileEntry(`Big/f${i}.jpg`));
    const read = await readDropped([source(dirEntry('Big', exactly))]);
    expect(read.files).toHaveLength(200);
    expect(read.truncated).toBe(false);
  });

  it('counts across everything dropped, not per folder', async () => {
    const one = dirEntry('A', Array.from({ length: 150 }, (_, i) => fileEntry(`A/f${i}.jpg`)));
    const two = dirEntry('B', Array.from({ length: 150 }, (_, i) => fileEntry(`B/f${i}.jpg`)));
    const read = await readDropped([source(one), source(two)]);
    expect(read.files).toHaveLength(200);
    expect(read.files[199]?.path).toBe('B/f49.jpg');
    expect(read.truncated).toBe(true);
  });

  it('lists a file or a folder the browser will not open, and carries on with the rest', async () => {
    const tree = dirEntry('Papers', [
      fileEntry('Papers/locked.pdf', file('locked.pdf'), true),
      dirEntry('Papers/Private', [], { fails: true }),
      fileEntry('Papers/fine.pdf'),
    ]);
    const read = await readDropped([source(tree)]);
    expect(read.files.map((f) => f.path)).toEqual(['Papers/fine.pdf']);
    expect(read.unreadable).toEqual([
      { name: 'Papers/locked.pdf', reason: 'unreadable' },
      { name: 'Papers/Private', reason: 'unreadable' },
    ]);
  });
});

describe('checkFile', () => {
  const ok = (f: File) => {
    const check = checkFile(f);
    if (!check.ok) throw new Error(`refused: ${check.reason}`);
    return check.item;
  };
  const reason = (f: File) => {
    const check = checkFile(f);
    return check.ok ? null : check.reason;
  };

  it('takes what the chat takes: photos, PDF, plain text and the Office Open XML files', () => {
    expect(ok(file('a.jpg', 'image/jpeg'))).toMatchObject({ kind: 'image', contentType: 'image/jpeg' });
    expect(ok(file('a.heic', 'image/heic'))).toMatchObject({ kind: 'image' });
    expect(ok(file('a.pdf', 'application/pdf'))).toMatchObject({ kind: 'file' });
    expect(ok(file('a.txt', 'text/plain'))).toMatchObject({ kind: 'file' });
    expect(
      ok(
        file(
          'a.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toMatchObject({ kind: 'file' });
    expect(
      ok(file('a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    ).toMatchObject({ kind: 'file' });
  });

  it('recovers an empty type from the extension, as the composer does for photos', () => {
    expect(ok(file('slip.JPG'))).toMatchObject({ kind: 'image', contentType: 'image/jpeg' });
    expect(ok(file('a.png'))).toMatchObject({ kind: 'image', contentType: 'image/png' });
  });

  it('leaves audio to the mic button: a dropped recording would be taken for a voice note', () => {
    expect(reason(file('a.mp3', 'audio/mpeg'))).toBe('audio');
    expect(reason(file('a.m4a'))).toBe('audio');
  });

  it('recovers the papers a desktop browser leaves untyped, and so presigns them as a type the server takes', () => {
    expect(ok(file('invoice.pdf'))).toMatchObject({ kind: 'file', contentType: 'application/pdf' });
    expect(ok(file('notes.txt'))).toMatchObject({ kind: 'file', contentType: 'text/plain' });
    expect(ok(file('sheet.XLSX')).contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(ok(file('letter.docx')).contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(ok(file('deck.pptx')).contentType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    // A system that says "no idea" in words gets the same treatment as one that says nothing.
    expect(ok(file('invoice.pdf', 'application/octet-stream')).contentType).toBe('application/pdf');
  });

  it('refuses what the server refuses, with the reason "type"', () => {
    expect(reason(file('old.doc', 'application/msword'))).toBe('type');
    expect(reason(file('old.xls', 'application/vnd.ms-excel'))).toBe('type');
    expect(reason(file('data.csv', 'text/csv'))).toBe('type');
    expect(reason(file('macro.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12'))).toBe('type');
    expect(reason(file('clip.mp4', 'video/mp4'))).toBe('type');
    expect(reason(file('all.zip', 'application/zip'))).toBe('type');
    expect(reason(file('setup.exe', 'application/x-msdownload'))).toBe('type');
    expect(reason(file('LICENSE'))).toBe('type');
    expect(reason(file('mystery.bin'))).toBe('type');
    // Not even one of the recovered extensions.
    expect(reason(file('old.doc'))).toBe('type');
  });

  it('refuses an empty file, and anything over 25 MB', () => {
    expect(reason(file('empty.pdf', 'application/pdf', 0))).toBe('empty');
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(reason(file('exact.pdf', 'application/pdf', MAX_UPLOAD_BYTES))).toBeNull();
    expect(reason(file('over.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1))).toBe('size');
  });

  it('says what the file is before how big it is', () => {
    expect(reason(file('film.mp4', 'video/mp4', MAX_UPLOAD_BYTES * 4))).toBe('type');
  });
});

describe('sortDropped', () => {
  it('splits what will go from what will not, naming the skipped by their path', () => {
    const { accepted, skipped } = sortDropped([
      { file: file('a.jpg', 'image/jpeg'), path: 'Trip/a.jpg' },
      { file: file('b.doc', 'application/msword'), path: 'Trip/b.doc' },
      { file: file('c.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1), path: 'c.pdf' },
      { file: file('d.pdf', 'application/pdf', 0), path: 'd.pdf' },
      { file: file('e.pdf', 'application/pdf'), path: 'e.pdf' },
    ]);
    expect(accepted.map((a) => a.file.name)).toEqual(['a.jpg', 'e.pdf']);
    expect(skipped).toEqual([
      { name: 'Trip/b.doc', reason: 'type' },
      { name: 'c.pdf', reason: 'size' },
      { name: 'd.pdf', reason: 'empty' },
    ]);
  });
});

describe('chunk', () => {
  it('makes messages of ten, the last one with what is left', () => {
    const sizes = (n: number) => chunk(Array.from({ length: n }, (_, i) => i)).map((c) => c.length);
    expect(sizes(0)).toEqual([]);
    expect(sizes(1)).toEqual([1]);
    expect(sizes(10)).toEqual([10]);
    expect(sizes(11)).toEqual([10, 1]);
    expect(sizes(25)).toEqual([10, 10, 5]);
    expect(sizes(200)).toEqual(Array(20).fill(10));
  });
});

describe('sendInBatches', () => {
  const items = (n: number): OutgoingAttachment[] =>
    Array.from({ length: n }, (_, i) => ({
      file: file(`f${i}.jpg`, 'image/jpeg'),
      kind: 'image' as const,
      contentType: 'image/jpeg',
    }));

  /** A send that behaves like the chat's: uploads each file (unless it is told to stop), posts once. */
  function chatSend(opts: { failing?: Set<string>; postFails?: (call: number) => boolean } = {}) {
    let calls = 0;
    let running = 0;
    let overlapped = false;
    const batches: string[][] = [];
    const send: SendBatch = async (files, hooks) => {
      calls += 1;
      running += 1;
      if (running > 1) overlapped = true;
      const uploaded: OutgoingAttachment[] = [];
      for (const f of files) {
        if (hooks.shouldStop()) break;
        await Promise.resolve();
        if (opts.failing?.has(f.file.name)) hooks.onFileFailed(f);
        else {
          uploaded.push(f);
          hooks.onFileUploaded(f);
        }
      }
      running -= 1;
      batches.push(uploaded.map((u) => u.file.name));
      if (uploaded.length === 0) throw new NothingToSendError();
      if (opts.postFails?.(calls)) throw new Error('network');
    };
    return { send, batches, overlapped: () => overlapped, calls: () => calls };
  }

  it('sends ten to a message, one message after another, and counts every file', async () => {
    const chat = chatSend();
    const progress: Array<[number, number]> = [];
    const outcome = await sendInBatches(items(25), chat.send, {
      isCancelled: () => false,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(chat.batches.map((b) => b.length)).toEqual([10, 10, 5]);
    expect(chat.overlapped()).toBe(false);
    expect(progress).toHaveLength(25);
    expect(progress[0]).toEqual([1, 25]);
    expect(progress[24]).toEqual([25, 25]);
    expect(outcome).toEqual({ sent: 25, failed: [], cancelled: false });
  });

  it('lists a file that will not upload, and the rest still go', async () => {
    const chat = chatSend({ failing: new Set(['f3.jpg', 'f12.jpg']) });
    const progress: number[] = [];
    const outcome = await sendInBatches(items(15), chat.send, {
      isCancelled: () => false,
      onProgress: (done) => progress.push(done),
    });
    expect(outcome.sent).toBe(13);
    expect(outcome.failed).toEqual([
      { name: 'f3.jpg', reason: 'upload' },
      { name: 'f12.jpg', reason: 'upload' },
    ]);
    expect(outcome.cancelled).toBe(false);
    // A failed file is still a file dealt with.
    expect(progress.at(-1)).toBe(15);
  });

  it('goes on to the next message when one whole message had nothing that would upload', async () => {
    const all = new Set(Array.from({ length: 10 }, (_, i) => `f${i}.jpg`));
    const chat = chatSend({ failing: all });
    const outcome = await sendInBatches(items(12), chat.send, {
      isCancelled: () => false,
      onProgress: () => undefined,
    });
    expect(chat.calls()).toBe(2);
    expect(outcome.sent).toBe(2);
    expect(outcome.failed).toHaveLength(10);
  });

  it('stops after Cancel: what is up is sent, the rest is not, and the outcome says so', async () => {
    const chat = chatSend();
    let cancel = false;
    const outcome = await sendInBatches(items(25), chat.send, {
      isCancelled: () => cancel,
      onProgress: (done) => {
        if (done === 4) cancel = true;
      },
    });
    // The first message went with the four files that were up when Cancel came.
    expect(chat.batches).toEqual([['f0.jpg', 'f1.jpg', 'f2.jpg', 'f3.jpg']]);
    expect(outcome).toEqual({ sent: 4, failed: [], cancelled: true });
  });

  it('does not start a message after Cancel', async () => {
    const chat = chatSend();
    let cancel = false;
    const outcome = await sendInBatches(items(25), chat.send, {
      isCancelled: () => cancel,
      onProgress: (done) => {
        if (done === 10) cancel = true;
      },
    });
    expect(chat.calls()).toBe(1);
    expect(outcome).toEqual({ sent: 10, failed: [], cancelled: true });
  });

  it('ends the run when a message will not post, and lists everything that did not go', async () => {
    const send = vi.fn<SendBatch>(async (files, hooks) => {
      for (const f of files) hooks.onFileUploaded(f);
      throw new Error('network');
    });
    const outcome = await sendInBatches(items(25), send, {
      isCancelled: () => false,
      onProgress: () => undefined,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome.sent).toBe(0);
    expect(outcome.failed).toHaveLength(25);
    expect(outcome.failed.every((f) => f.reason === 'upload')).toBe(true);
    expect(outcome.cancelled).toBe(false);
  });

  it('keeps what an earlier message sent when a later one will not post', async () => {
    let call = 0;
    const send = vi.fn<SendBatch>(async (files, hooks) => {
      call += 1;
      for (const f of files) hooks.onFileUploaded(f);
      if (call === 2) throw new Error('network');
    });
    const outcome = await sendInBatches(items(25), send, {
      isCancelled: () => false,
      onProgress: () => undefined,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcome.sent).toBe(10);
    expect(outcome.failed).toHaveLength(15);
  });
});
