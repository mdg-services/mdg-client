import {
  DOCUMENT_ASK_MAX_BYTES,
  DOCUMENT_ASK_MIME_TYPES,
  type DocumentAskAttachmentInput,
} from '@dk/shared/schemas';

import { preparePhoto, presignAndPut, type PreparedPhoto } from './uploadCommon';

/**
 * Send the paper that answers one Document Ask.
 *
 * This is the SIXTH upload path in this app and the first one that is not a
 * copy: the mechanics it shares with the other photo uploads — recovering the
 * MIME an Android camera did not set, shrinking a 6 MB JPEG, presign → PUT →
 * describe what landed — live in `uploadCommon.ts`, and what stays here is only
 * what is true of a document ask and of nothing else.
 *
 * TWO THINGS ARE GENUINELY DIFFERENT ABOUT AN ASK
 * -----------------------------------------------
 *  1. IT CAN BE A PDF. Every other upload in this app that reaches for a camera
 *     is an image and may assume so; a fire NOC arrives as a scan far more often
 *     than as a photograph. So the type is resolved against
 *     {@link DOCUMENT_ASK_MIME_TYPES} — the ONE declaration the presign route and
 *     the submit route both read — rather than assumed to be a picture. Assuming
 *     an image would label a `.pdf` with an empty MIME as `image/jpeg`, the
 *     submit would be refused by the server's enum, and the dealer would be told
 *     their document is not a document.
 *  2. THE KEY NEEDS THE ASK. An ask's object is filed under
 *     `ask/<dealerId>/<askId>/`, and that prefix IS the access fence the submit
 *     route checks against. So the row must exist before there is anywhere to
 *     put the file — which is why a dealer volunteering a paper mints the row
 *     first (`/v1/asks/me/volunteer`) and uploads second.
 */

/** The MIME types an ask will take. Narrowed from the one shared declaration. */
export type DocumentAskMime = (typeof DOCUMENT_ASK_MIME_TYPES)[number];

/** What a file input should offer. Built from the same list, so the two cannot drift. */
export const DOCUMENT_ASK_ACCEPT = DOCUMENT_ASK_MIME_TYPES.join(',');

/** Extension → MIME, for the pickers that hand back a `File` with an empty type. */
const ASK_EXT_MIME: Record<string, DocumentAskMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Is this one of the four types an ask accepts? A type guard, so no cast is needed. */
function isAskMime(type: string): type is DocumentAskMime {
  return (DOCUMENT_ASK_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * What this file IS, in the vocabulary an ask speaks — or `null` when it is
 * something MDG cannot accept.
 *
 * Resolved at PICK time, not at send time, so a dealer who chose a video or a
 * HEIC photograph is told at once rather than after a minute of uploading. HEIC
 * is refused for the reason `DOCUMENT_ASK_MIME_TYPES` gives: a browser canvas
 * cannot decode it, so it can neither be shrunk before it is sent nor shown back
 * to whoever has to check it.
 *
 * `fromCamera` is the one place an assumption is allowed. An Android System
 * WebView camera capture routinely arrives with an empty `type` AND an empty
 * `name`, so there is nothing left to read — but the tap that produced it was a
 * tap on a camera, and that is knowledge the file itself does not carry.
 */
export function resolveAskFile(
  file: File,
  opts?: { fromCamera?: boolean },
): { contentType: DocumentAskMime; kind: 'image' | 'file' } | null {
  const raw = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  const byExt = ASK_EXT_MIME[extensionOf(file.name)];
  const resolved: string | undefined =
    (raw && isAskMime(raw) ? raw : undefined) ??
    byExt ??
    (raw === '' && opts?.fromCamera ? 'image/jpeg' : undefined);
  if (!resolved || !isAskMime(resolved)) return null;
  return {
    contentType: resolved,
    // The wire `kind` the submit schema takes. A PDF is a `file`; everything
    // else here is an image the reviewer can render in place.
    kind: resolved === 'application/pdf' ? 'file' : 'image',
  };
}

/** Is this file small enough to send at all? The cap is the shared one, not a local guess. */
export function isAskFileTooBig(file: File): boolean {
  return file.size > DOCUMENT_ASK_MAX_BYTES;
}

/**
 * Shrink the picture and settle its name and type — BEFORE anything is queued.
 *
 * THE ORDER MATTERS AND IT IS NOT OBVIOUS. A raw camera JPEG is 3–6 MB, and the
 * offline queue keeps its bytes in localStorage as base64 inside a five-megabyte
 * quota. Preparing at SEND time — the arrangement every other upload path in
 * this app uses, because none of them queues anything — would mean the queue
 * holding the uncompressed original, which does not fit, is therefore never
 * written down, and is therefore lost by the reload the queue exists to survive.
 * So the file is prepared once, here, and the prepared bytes are what wait.
 *
 * A PDF passes through untouched: `compressImage` declines anything that is not
 * a raster image, so a multi-page scan is never flattened or re-encoded. That is
 * also why the ten-megabyte cap exists — a scan is not compressed at all, and
 * past that size an upload from a forecourt connection does not finish, it just
 * fails slowly, twice, before anybody asks why.
 */
export function prepareAskFile(
  file: File,
  contentType: DocumentAskMime,
): Promise<PreparedPhoto> {
  const fallbackName = contentType === 'application/pdf' ? 'document.pdf' : 'paper.jpg';
  return preparePhoto(file, fallbackName, { contentType });
}

/**
 * Put the paper in the bucket and describe what landed.
 *
 * Returns the attachment in exactly the shape `submitDocumentAskSchema` takes,
 * measured on the bytes that were actually PUT — so what the server records is
 * what is in the bucket, not what came off the camera.
 */
export async function uploadDocumentAsk(opts: {
  photo: PreparedPhoto;
  kind: 'image' | 'file';
  dealerId: string;
  /** The ask this paper answers. It is half the storage key, so it is required. */
  askId: string;
}): Promise<DocumentAskAttachmentInput> {
  const storageKey = await presignAndPut(opts.photo, {
    scope: 'ask',
    dealerId: opts.dealerId,
    askId: opts.askId,
  });
  return {
    storageKey,
    filename: opts.photo.filename,
    // Guarded rather than cast: `preparePhoto` can hand back a different type
    // from the one it was given (a re-encode to JPEG), and only the four types
    // the shared declaration names may be sent. Anything else here would be
    // refused by the submit route's enum after the bytes had already gone.
    contentType: isAskMime(opts.photo.contentType) ? opts.photo.contentType : 'image/jpeg',
    size: opts.photo.size,
    kind: opts.kind,
  };
}
