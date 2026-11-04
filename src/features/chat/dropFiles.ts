import { NothingToSendError } from '@/hooks/api/useSendMessage';
import { resolveFileType, type OutgoingAttachment } from '@/lib/uploadAttachment';

/**
 * Files and folders dropped on a chat screen (ADR 0032 §6): read them, say which
 * can be sent and which cannot, and send the rest ten to a message.
 *
 * The dropping itself — the "Drop to send" layer, the progress card — is
 * `DropToSend.tsx`. Everything that can be decided without a screen is here.
 */

/** A folder dropped by mistake can hold thousands of files: read this many and stop. */
export const MAX_DROP_FILES = 200;

/**
 * The server's ceiling on one upload (`/uploads/sign`), and on the size an attachment may declare.
 * The app's "MB" is this kind (1,048,576 bytes), as `formatBytes` shows it and as the server's
 * own comments say it, so the card's "25 MB" is exactly this number.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The server's ceiling on attachments in one message. */
export const FILES_PER_MESSAGE = 10;

/** Why a dropped file is not being sent. */
export type SkipReason = 'type' | 'audio' | 'size' | 'empty' | 'unreadable' | 'upload';

export interface SkippedFile {
  /** The path inside the dropped folder (`Papers/July/slip.pdf`), or the file's own name. */
  name: string;
  reason: SkipReason;
}

export interface DroppedFile {
  file: File;
  path: string;
}

/** What one dragged item gives while the drop event is still running. */
export interface DropSource {
  /** The file or folder, from `webkitGetAsEntry`. Null where the browser has none. */
  entry: FileSystemEntry | null;
  /** The plain file the browser hands over for it. */
  file: File | null;
}

/**
 * Take what was dropped, NOW. A `DataTransfer` empties the moment the drop event
 * finishes, so this must run inside the handler; only the folder walk after it may
 * wait. Where the browser has no `webkitGetAsEntry` (or gives none for an item, as for
 * a file dragged out of some mail programs), the plain file is used.
 */
export function snapshotDrop(dt: DataTransfer): DropSource[] {
  const items = dt.items ? Array.from(dt.items).filter((i) => i.kind === 'file') : [];
  if (items.length > 0) {
    return items.map((item) => {
      let entry: FileSystemEntry | null = null;
      try {
        entry = item.webkitGetAsEntry?.() ?? null;
      } catch {
        entry = null;
      }
      return { entry, file: item.getAsFile() };
    });
  }
  return Array.from(dt.files ?? []).map((file) => ({ entry: null, file }));
}

/** What the operating system leaves in a folder that nobody meant to send. */
const JUNK_NAME = /^(\.ds_store|thumbs\.db|desktop\.ini|~\$.*)$/i;

export interface ReadResult {
  files: DroppedFile[];
  /** Files and folders the browser would not open. */
  unreadable: SkippedFile[];
  /** There were more than {@link MAX_DROP_FILES}: the rest were not looked at. */
  truncated: boolean;
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function nextBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: ReadResult, limit: number): Promise<void> {
  const path = entry.fullPath.replace(/^\/+/, '') || entry.name;
  if (entry.isFile) {
    if (JUNK_NAME.test(entry.name)) return;
    if (out.files.length >= limit) {
      out.truncated = true;
      return;
    }
    try {
      out.files.push({ file: await fileOf(entry as FileSystemFileEntry), path });
    } catch {
      out.unreadable.push({ name: path, reason: 'unreadable' });
    }
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // A directory reader hands back a hundred or so entries a call, and an empty
  // answer is what says it is done: one call would silently lose the rest.
  for (;;) {
    let batch: FileSystemEntry[];
    try {
      batch = await nextBatch(reader);
    } catch {
      out.unreadable.push({ name: path, reason: 'unreadable' });
      return;
    }
    if (batch.length === 0) return;
    for (const child of batch) {
      if (out.truncated) return;
      await walk(child, out, limit);
    }
  }
}

/**
 * Open everything that was dropped: files as they are, folders to any depth, in the
 * order the browser lists them. Stops after `limit` files.
 */
export async function readDropped(
  sources: DropSource[],
  limit: number = MAX_DROP_FILES,
): Promise<ReadResult> {
  const out: ReadResult = { files: [], unreadable: [], truncated: false };
  for (const source of sources) {
    if (out.truncated) break;
    if (source.entry) {
      await walk(source.entry, out, limit);
    } else if (source.file && !JUNK_NAME.test(source.file.name)) {
      if (out.files.length >= limit) out.truncated = true;
      else out.files.push({ file: source.file, path: source.file.name });
    }
  }
  return out;
}

/** What `/uploads/sign` is given for a file whose type the browser did not report. */
const DOCUMENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * Whether the server will presign this type: images, audio, PDF, plain text and the
 * Office Open XML formats (`ALLOWED_PREFIXES` / `ALLOWED_EXACT` in the backend's
 * uploads route). Not the old `.doc` and `.xls`, which the composer's document chooser
 * still offers and the server then refuses.
 */
function isSendableType(type: string): boolean {
  return (
    type.startsWith('image/') ||
    type.startsWith('audio/') ||
    type === 'application/pdf' ||
    type === 'text/plain' ||
    type.startsWith('application/vnd.openxmlformats-officedocument.')
  );
}

export type FileCheck = { ok: true; item: OutgoingAttachment } | { ok: false; reason: SkipReason };

/**
 * Whether one file can be sent, and as what. The type comes from the same
 * `resolveFileType` the composer uses — an empty one is recovered from the extension —
 * and then, for the papers a desktop browser leaves untyped, from the extension too.
 */
export function checkFile(file: File): FileCheck {
  let { kind, contentType } = resolveFileType(file);
  if (contentType === 'application/octet-stream') {
    const dot = file.name.lastIndexOf('.');
    const guess = dot >= 0 ? DOCUMENT_TYPE_BY_EXTENSION[file.name.slice(dot + 1).toLowerCase()] : '';
    if (guess) {
      contentType = guess;
      kind = 'file';
    }
  }
  if (!isSendableType(contentType)) return { ok: false, reason: 'type' };
  // The chat takes audio only as a voice note, which the team's first reply listens to and writes
  // down; a dropped recording or song would be taken for one. Voice notes go with the mic button.
  if (kind === 'audio') return { ok: false, reason: 'audio' };
  if (file.size === 0) return { ok: false, reason: 'empty' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, item: { file, kind, contentType } };
}

/** Split what was read into what will be sent and what will not, with the reason. */
export function sortDropped(files: DroppedFile[]): {
  accepted: OutgoingAttachment[];
  skipped: SkippedFile[];
} {
  const accepted: OutgoingAttachment[] = [];
  const skipped: SkippedFile[] = [];
  for (const { file, path } of files) {
    const check = checkFile(file);
    if (check.ok) accepted.push(check.item);
    else skipped.push({ name: path, reason: check.reason });
  }
  return { accepted, skipped };
}

export function chunk<T>(items: T[], size: number = FILES_PER_MESSAGE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** What the chat screen's own send is told, so the drop can follow it file by file. */
export interface SendHooks {
  onFileUploaded: (item: OutgoingAttachment) => void;
  onFileFailed: (item: OutgoingAttachment) => void;
  shouldStop: () => boolean;
}

/** One message's worth of files, through the chat's own upload and post. */
export type SendBatch = (files: OutgoingAttachment[], hooks: SendHooks) => Promise<unknown>;

export interface SendOutcome {
  /** Files that went out in a message that was posted. */
  sent: number;
  /** Files that did not: the upload failed, or the message did not post. */
  failed: SkippedFile[];
  /** Cancel was pressed with files still waiting. */
  cancelled: boolean;
}

/**
 * Send the files ten to a message, one message after another.
 *
 * ONE AFTER ANOTHER, NOT TOGETHER: every message a dealer sends wakes the MDG team's
 * phones and starts the reply clock, and a link that is slow for one upload is slower
 * for six. A file that will not upload is listed and the rest still go. A message that
 * will not POST ends the run — the link is gone, and trying twenty more would only
 * queue twenty more failures — and everything not yet sent is listed as not sent.
 */
export async function sendInBatches(
  files: OutgoingAttachment[],
  send: SendBatch,
  opts: {
    isCancelled: () => boolean;
    onProgress: (done: number, total: number) => void;
  },
): Promise<SendOutcome> {
  const total = files.length;
  const batches = chunk(files);
  const failed: SkippedFile[] = [];
  let done = 0;
  let sent = 0;

  for (let b = 0; b < batches.length; b += 1) {
    if (opts.isCancelled()) break;
    const batch = batches[b] ?? [];
    const uploaded: OutgoingAttachment[] = [];
    const hooks: SendHooks = {
      shouldStop: opts.isCancelled,
      onFileUploaded: (item) => {
        uploaded.push(item);
        done += 1;
        opts.onProgress(done, total);
      },
      onFileFailed: (item) => {
        failed.push({ name: item.file.name, reason: 'upload' });
        done += 1;
        opts.onProgress(done, total);
      },
    };
    try {
      await send(batch, hooks);
      sent += uploaded.length;
    } catch (err) {
      // Every file of the batch failed to upload (each already listed) or Cancel
      // came before the first one: there was no message to post, and that is not a failure.
      if (err instanceof NothingToSendError) continue;
      for (const item of uploaded) failed.push({ name: item.file.name, reason: 'upload' });
      for (const item of batches.slice(b + 1).flat()) {
        failed.push({ name: item.file.name, reason: 'upload' });
      }
      break;
    }
  }

  return { sent, failed, cancelled: total - sent - failed.length > 0 };
}
