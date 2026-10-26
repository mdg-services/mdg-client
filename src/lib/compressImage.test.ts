import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compressImage } from './compressImage';

/**
 * jsdom decodes no pictures and draws no canvases, so both are stood in for. What
 * these tests pin is the DECISION: when a photo is re-encoded and when it is left
 * alone — above all, that an iPhone's HEIC always becomes a JPEG.
 */

const KB = 1024;
const file = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

/** What the re-encode produces, in bytes; the canvas hands back exactly this. */
let jpegBytes = 40 * KB;
let decodeFails = false;
const bitmapClose = vi.fn();

beforeEach(() => {
  jpegBytes = 40 * KB;
  decodeFails = false;
  bitmapClose.mockReset();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (decodeFails) throw new Error('cannot decode');
      return { width: 3000, height: 2000, close: bitmapClose };
    }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
    cb(new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compressImage — an ordinary photo', () => {
  it('shrinks a large JPEG to a smaller JPEG', async () => {
    const out = await compressImage(file('IMG_1.jpg', 'image/jpeg', 2000 * KB));
    expect(out).not.toBeNull();
    expect(out!.type).toBe('image/jpeg');
    expect(out!.name).toBe('IMG_1.jpg');
    expect(out!.size).toBe(40 * KB);
  });

  it('leaves a small JPEG alone', async () => {
    expect(await compressImage(file('small.jpg', 'image/jpeg', 100 * KB))).toBeNull();
  });

  it('keeps the original when re-encoding saves nothing', async () => {
    jpegBytes = 900 * KB;
    expect(await compressImage(file('IMG_2.jpg', 'image/jpeg', 800 * KB))).toBeNull();
  });

  it('leaves a GIF alone (it would be flattened to one frame)', async () => {
    expect(await compressImage(file('a.gif', 'image/gif', 2000 * KB))).toBeNull();
  });

  it('leaves a PDF alone', async () => {
    expect(await compressImage(file('a.pdf', 'application/pdf', 2000 * KB))).toBeNull();
  });
});

describe('compressImage — an iPhone\'s HEIC photo', () => {
  // The size floor and the "no saving" rule exist to skip pointless work. For a
  // HEIC they would skip the conversion — and MDG's team, an Android phone and
  // this app's own preview cannot open a HEIC at all.
  it('is converted to JPEG even though it is small', async () => {
    const out = await compressImage(file('IMG_0001.HEIC', 'image/heic', 120 * KB));
    expect(out).not.toBeNull();
    expect(out!.type).toBe('image/jpeg');
    expect(out!.name).toBe('IMG_0001.jpg');
  });

  it('is converted even when the JPEG is not smaller than the HEIC', async () => {
    jpegBytes = 400 * KB;
    const out = await compressImage(file('IMG_0002.heic', 'image/heic', 250 * KB));
    expect(out).not.toBeNull();
    expect(out!.size).toBe(400 * KB);
    expect(out!.type).toBe('image/jpeg');
  });

  it('knows HEIF too', async () => {
    const out = await compressImage(file('IMG_0003.heif', 'image/heif', 80 * KB));
    expect(out?.type).toBe('image/jpeg');
  });

  it('knows a HEIC by its name when the phone gives it no type', async () => {
    const out = await compressImage(file('IMG_0004.HEIC', '', 80 * KB));
    expect(out?.type).toBe('image/jpeg');
    expect(out?.name).toBe('IMG_0004.jpg');
  });

  it('knows a HEIC by its type when the name says nothing', async () => {
    const out = await compressImage(file('photo', 'image/heic', 80 * KB));
    expect(out?.type).toBe('image/jpeg');
    expect(out?.name).toBe('photo.jpg');
  });

  // Not every phone can decode HEIC (Chrome on Android cannot). Then the original
  // goes up as it is — the same as any photo that could not be processed.
  it('keeps the original when this phone cannot decode it', async () => {
    decodeFails = true;
    expect(await compressImage(file('IMG_0005.heic', 'image/heic', 120 * KB))).toBeNull();
  });

  it('keeps the original when the canvas gives nothing back', async () => {
    jpegBytes = 0;
    expect(await compressImage(file('IMG_0006.heic', 'image/heic', 120 * KB))).toBeNull();
  });

  it('keeps the original where there is no way to decode at all', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await compressImage(file('IMG_0007.heic', 'image/heic', 120 * KB))).toBeNull();
  });
});
