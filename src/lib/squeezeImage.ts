import { WASHROOM_PHOTO_MAX_BYTES, WASHROOM_PHOTO_TARGET_BYTES } from '@dk/shared/types';

/**
 * Make a photo small enough for IndianOil's washroom page (ADR 0037).
 *
 * The page takes at most 500 KB per photo and refuses the whole form otherwise, so
 * the owner's phone does the squeezing BEFORE anything is sent: it aims at 400 KB
 * ({@link WASHROOM_PHOTO_TARGET_BYTES}) so the 500 KB cap is never close.
 *
 * The order of things, and why:
 *
 *  1. The picture is drawn on a canvas with its long edge at most 1600 px (a
 *     washroom photo is no better for more) and saved as a JPEG at quality 0.85.
 *  2. Still over the aim: the quality goes down one step at a time (0.75, 0.65,
 *     0.55). Quality is the cheap way to lose bytes, so it is spent first.
 *  3. Still over at the lowest step: the picture itself gets smaller (each size is
 *     four fifths of the one before, never below 640 px on the long edge) and the
 *     quality steps start again from the top.
 *  4. Nothing reached the aim but one result fitted under 500 KB: that one is used.
 *  5. Nothing fitted at all: the photo is refused, in words the owner can act on.
 *
 * It ALWAYS draws the picture again, even a small JPEG, so what leaves the phone is
 * always a plain JPEG. That also drops the place the phone writes into a photo, and
 * turns a PNG or a WebP into the JPEG the portal expects.
 *
 * This is a different job from `compressImage` (chat photos): that one skips small
 * files and aims at "smaller", this one aims at a number and refuses when it cannot
 * reach it. The two are kept apart so neither grows an `if` for the other.
 *
 * The decisions (how big, in what order, when to give up) are plain functions, and
 * the canvas sits behind a small interface ({@link Decoded}), so they are tested
 * without a real picture decoder.
 */

/** Longest edge of the first attempt, in pixels. */
export const SQUEEZE_MAX_EDGE = 1600;
/** The picture is never made smaller than this on its long edge. */
export const SQUEEZE_MIN_EDGE = 640;
/** Each smaller size is this fraction of the one before. */
export const SQUEEZE_EDGE_STEP = 0.8;
/** JPEG quality, tried in this order at each size. */
export const SQUEEZE_QUALITY_STEPS: readonly number[] = [0.85, 0.75, 0.65, 0.55];

/** Why a picked file was turned away. */
export type ImageRejection =
  /** Not a picture at all (a PDF, a voice note). */
  | 'type'
  /** A picture, but it cannot be made small enough. */
  | 'size'
  /** A phone-format (HEIC) photo this browser cannot open. */
  | 'heic'
  /** Something this browser cannot open or draw. */
  | 'unreadable';

export class ImageRejected extends Error {
  readonly reason: ImageRejection;
  constructor(reason: ImageRejection) {
    super(`photo rejected: ${reason}`);
    this.name = 'ImageRejected';
    this.reason = reason;
  }
}

/** One thing to try: draw at this size, save at this quality. */
export interface Attempt {
  width: number;
  height: number;
  quality: number;
}

/**
 * A picture opened and ready to be drawn at any size. The real one is a canvas
 * ({@link decodeWithCanvas}); tests hand in a stand-in.
 */
export interface Decoded {
  /** The picture's own size, in pixels. */
  width: number;
  height: number;
  /** Draw at this size and save as a JPEG at this quality; null when the browser could not. */
  encode(width: number, height: number, quality: number): Promise<Blob | null>;
  /** Let go of the picture's memory (a cheap phone has little). */
  release(): void;
}

export interface SqueezeOptions {
  /** What to aim at. Default: {@link WASHROOM_PHOTO_TARGET_BYTES}. */
  targetBytes?: number;
  /** The most the portal takes. Default: {@link WASHROOM_PHOTO_MAX_BYTES}. */
  maxBytes?: number;
  maxEdge?: number;
  minEdge?: number;
}

/** A size that fits inside `maxEdge` on its long edge, the same shape, never bigger than the original. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  const scale = long > maxEdge ? maxEdge / long : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Everything to try, in order: the biggest size at every quality, then the next
 * size down at every quality, and so on until the smallest size allowed.
 */
export function squeezeAttempts(
  width: number,
  height: number,
  opts: Pick<SqueezeOptions, 'maxEdge' | 'minEdge'> = {},
): Attempt[] {
  const maxEdge = opts.maxEdge ?? SQUEEZE_MAX_EDGE;
  const minEdge = opts.minEdge ?? SQUEEZE_MIN_EDGE;

  const sizes = [fitWithin(width, height, maxEdge)];
  let edge = Math.max(sizes[0]!.width, sizes[0]!.height);
  for (;;) {
    edge = Math.floor(edge * SQUEEZE_EDGE_STEP);
    // `edge < 1` ends the walk whatever the caller's `minEdge` is: a `minEdge` of 0 or NaN
    // would otherwise never be reached, and the loop would never end.
    if (edge < minEdge || edge < 1) break;
    sizes.push(fitWithin(width, height, edge));
  }

  return sizes.flatMap((size) =>
    SQUEEZE_QUALITY_STEPS.map((quality) => ({ width: size.width, height: size.height, quality })),
  );
}

/** An iPhone's own photo format, by its type or, when the type is empty, its name. */
export function looksLikeHeic(file: File): boolean {
  const type = (file.type || '').split(';')[0]!.trim().toLowerCase();
  return /^image\/hei[cf]$/.test(type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * The picture as pixels, turned the way the phone was held. A phone writes "this photo is
 * rotated" into the file instead of rotating the pixels, and drawing on a canvas drops that
 * note, so a portrait photo could reach IndianOil lying on its side. Browsers now apply the
 * note by default, but an older Android WebView may not: ask for it by name.
 *
 * A browser that does not know the `imageOrientation` value throws on it, and every photo
 * would then count as unreadable. So: try with the option, and on any failure try once more
 * without it (a file that really cannot be opened fails the second time too, and the
 * caller says so).
 *
 * `open` is for tests; the app always uses the browser's own.
 */
export async function openBitmap(
  file: File,
  open: (file: File, options?: ImageBitmapOptions) => Promise<ImageBitmap> = (f, options) =>
    options ? createImageBitmap(f, options) : createImageBitmap(f),
): Promise<ImageBitmap> {
  try {
    return await open(file, { imageOrientation: 'from-image' });
  } catch {
    return open(file);
  }
}

/** The picture opened on a normal canvas (not OffscreenCanvas, which an old Android WebView lacks). */
async function decodeWithCanvas(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    throw new Error('this browser cannot open pictures');
  }
  const bitmap = await openBitmap(file);
  const canvas = document.createElement('canvas');
  return {
    width: bitmap.width,
    height: bitmap.height,
    async encode(width, height, quality) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // A JPEG has no see-through: left alone, a PNG's clear parts would turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      });
    },
    release() {
      bitmap.close?.();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** The JPEG as a file, named after the picture it came from. */
function asJpegFile(blob: Blob, from: File): File {
  const base = from.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * The picture, as a JPEG at or under the aim (or, failing that, under the portal's
 * cap). Throws {@link ImageRejected} with the reason when it cannot.
 *
 * `decode` is for tests; the app always uses the canvas.
 */
export async function squeezeImage(
  file: File,
  opts: SqueezeOptions = {},
  decode: (file: File) => Promise<Decoded> = decodeWithCanvas,
): Promise<File> {
  const maxBytes = opts.maxBytes ?? WASHROOM_PHOTO_MAX_BYTES;
  // The aim can never sit above the cap, whatever the caller passed.
  const targetBytes = Math.min(opts.targetBytes ?? WASHROOM_PHOTO_TARGET_BYTES, maxBytes);

  let picture: Decoded;
  try {
    picture = await decode(file);
  } catch {
    // A phone-format photo this browser cannot open is the common case; say so.
    throw new ImageRejected(looksLikeHeic(file) ? 'heic' : 'unreadable');
  }

  try {
    if (!(picture.width > 0) || !(picture.height > 0)) throw new ImageRejected('unreadable');

    let produced = false;
    // The first result under the cap: used only if nothing reaches the aim.
    let underCap: Blob | null = null;

    for (const attempt of squeezeAttempts(picture.width, picture.height, opts)) {
      let blob: Blob | null;
      try {
        blob = await picture.encode(attempt.width, attempt.height, attempt.quality);
      } catch {
        blob = null;
      }
      if (!blob || blob.size === 0) continue;
      produced = true;
      if (blob.size <= targetBytes) return asJpegFile(blob, file);
      if (!underCap && blob.size <= maxBytes) underCap = blob;
    }

    if (underCap) return asJpegFile(underCap, file);
    throw new ImageRejected(produced ? 'size' : 'unreadable');
  } finally {
    picture.release();
  }
}
