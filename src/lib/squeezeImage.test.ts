import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fitWithin,
  ImageRejected,
  looksLikeHeic,
  openBitmap,
  SQUEEZE_QUALITY_STEPS,
  squeezeAttempts,
  squeezeImage,
  type Attempt,
  type Decoded,
} from './squeezeImage';

/**
 * jsdom decodes no pictures and draws no canvases, so the picture is a stand-in:
 * `bytesFor` says how big the JPEG would be at a size and quality. What these tests
 * pin is the DECISION — what is tried, in what order, when it stops and when it
 * gives up — never the pixels.
 */

const KB = 1024;
const file = (name: string, type = 'image/jpeg', bytes = 8) =>
  new File([new Uint8Array(bytes)], name, { type });

interface FakePicture extends Decoded {
  calls: Attempt[];
  released: number;
}

function fakePicture(
  width: number,
  height: number,
  bytesFor: (a: Attempt) => number | null,
): FakePicture {
  const picture: FakePicture = {
    width,
    height,
    calls: [],
    released: 0,
    async encode(w, h, quality) {
      const attempt = { width: w, height: h, quality };
      picture.calls.push(attempt);
      const size = bytesFor(attempt);
      return size === null ? null : new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
    },
    release() {
      picture.released += 1;
    },
  };
  return picture;
}

const decodeTo = (picture: Decoded) => async () => picture;

describe('fitWithin — the dimension maths', () => {
  it('brings the long edge down to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it('never makes a picture bigger', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('rounds to whole pixels and never reaches zero', () => {
    expect(fitWithin(3999, 3001, 1600)).toEqual({ width: 1600, height: 1201 });
    expect(fitWithin(5000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('squeezeAttempts — what is tried, in order', () => {
  it('starts at the biggest size and the best quality, then steps the quality down', () => {
    const all = squeezeAttempts(4000, 3000);
    expect(all[0]).toEqual({ width: 1600, height: 1200, quality: 0.85 });
    expect(all.slice(0, 4).map((a) => a.quality)).toEqual([0.85, 0.75, 0.65, 0.55]);
    expect(new Set(all.slice(0, 4).map((a) => a.width))).toEqual(new Set([1600]));
  });

  it('only then makes the picture smaller, each size four fifths of the one before', () => {
    const all = squeezeAttempts(4000, 3000);
    const longEdges = [...new Set(all.map((a) => Math.max(a.width, a.height)))];
    expect(longEdges).toEqual([1600, 1280, 1024, 819, 655]);
    // …and the quality steps begin again at each size.
    expect(all[4]).toEqual({ width: 1280, height: 960, quality: 0.85 });
    expect(all).toHaveLength(longEdges.length * SQUEEZE_QUALITY_STEPS.length);
  });

  it('keeps the shape at every size and never grows or repeats one', () => {
    const widths = [...new Set(squeezeAttempts(3000, 4000).map((a) => a.width))];
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    for (const a of squeezeAttempts(3000, 4000)) {
      expect(Math.abs(a.width / a.height - 0.75)).toBeLessThan(0.01);
    }
  });

  it('starts a small picture at its own size, and stops at the smallest size allowed', () => {
    const edges = (w: number, h: number) => [
      ...new Set(squeezeAttempts(w, h).map((a) => Math.max(a.width, a.height))),
    ];
    expect(edges(800, 600)).toEqual([800, 640]);
    // Already under the smallest size: one size, every quality.
    expect(edges(500, 400)).toEqual([500]);
    expect(squeezeAttempts(500, 400)).toHaveLength(SQUEEZE_QUALITY_STEPS.length);
  });

  it('takes its limits from the caller when given them', () => {
    const edges = [
      ...new Set(
        squeezeAttempts(4000, 3000, { maxEdge: 1000, minEdge: 700 }).map((a) =>
          Math.max(a.width, a.height),
        ),
      ),
    ];
    expect(edges).toEqual([1000, 800]);
  });
});

describe('squeezeAttempts — it always ends', () => {
  it('ends for a minimum edge of 0, NaN or a negative number instead of walking down for ever', () => {
    for (const minEdge of [0, -5, Number.NaN]) {
      const all = squeezeAttempts(4000, 3000, { minEdge });
      // A finite, small list that never asks for a picture under one pixel.
      expect(all.length).toBeGreaterThan(0);
      expect(all.length).toBeLessThan(500);
      expect(all.every((a) => a.width >= 1 && a.height >= 1)).toBe(true);
    }
  });

  it('ends for a maximum edge that is zero or NaN, too', () => {
    for (const maxEdge of [0, Number.NaN]) {
      expect(squeezeAttempts(4000, 3000, { maxEdge }).length).toBeLessThan(500);
    }
  });

  it('is unchanged for the usual limits', () => {
    expect(squeezeAttempts(4000, 3000)).toHaveLength(5 * SQUEEZE_QUALITY_STEPS.length);
  });
});

describe('openBitmap — the way the phone was held', () => {
  const bitmap = { width: 3, height: 4 } as unknown as ImageBitmap;
  const picked = file('IMG_1.jpg');

  it('asks for the photo to be turned the way it was taken', async () => {
    const open = vi.fn().mockResolvedValue(bitmap);
    await expect(openBitmap(picked, open)).resolves.toBe(bitmap);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(picked, { imageOrientation: 'from-image' });
  });

  it('opens it again without the option when the browser does not know it, instead of calling the photo unreadable', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(
        new TypeError("The provided value 'from-image' is not a valid enum value"),
      )
      .mockResolvedValueOnce(bitmap);
    await expect(openBitmap(picked, open)).resolves.toBe(bitmap);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[0]).toEqual([picked, { imageOrientation: 'from-image' }]);
    expect(open.mock.calls[1]).toEqual([picked]);
  });

  it('fails when the plain call fails too: a file that cannot be opened is still unreadable', async () => {
    const open = vi.fn().mockRejectedValue(new Error('cannot decode'));
    await expect(openBitmap(picked, open)).rejects.toThrow('cannot decode');
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('squeezeImage — the target-size loop', () => {
  it('draws once and is done when the first try is already under the aim', async () => {
    const picture = fakePicture(4000, 3000, () => 100 * KB);
    const out = await squeezeImage(file('IMG_0042.HEIC', 'image/heic'), {}, decodeTo(picture));
    expect(picture.calls).toEqual([{ width: 1600, height: 1200, quality: 0.85 }]);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0042.jpg');
    expect(out.size).toBe(100 * KB);
    expect(picture.released).toBe(1);
  });

  it('takes a result exactly at the aim', async () => {
    const picture = fakePicture(4000, 3000, () => 400 * KB);
    const out = await squeezeImage(file('a.jpg'), {}, decodeTo(picture));
    expect(out.size).toBe(400 * KB);
    expect(picture.calls).toHaveLength(1);
  });

  it('lowers the quality one step at a time, and stops at the first that is under the aim', async () => {
    const bytes: Record<number, number> = { 0.85: 520 * KB, 0.75: 460 * KB, 0.65: 390 * KB };
    const picture = fakePicture(4000, 3000, (a) => bytes[a.quality] ?? 300 * KB);
    const out = await squeezeImage(file('a.jpg'), {}, decodeTo(picture));
    expect(picture.calls.map((c) => [c.width, c.quality])).toEqual([
      [1600, 0.85],
      [1600, 0.75],
      [1600, 0.65],
    ]);
    expect(out.size).toBe(390 * KB);
  });

  it('makes the picture smaller only when the lowest quality is still over the aim', async () => {
    const picture = fakePicture(4000, 3000, (a) => (a.width >= 1600 ? 600 * KB : 380 * KB));
    const out = await squeezeImage(file('a.jpg'), {}, decodeTo(picture));
    expect(picture.calls.map((c) => [c.width, c.quality])).toEqual([
      [1600, 0.85],
      [1600, 0.75],
      [1600, 0.65],
      [1600, 0.55],
      // The next size down, with the quality back at the top.
      [1280, 0.85],
    ]);
    expect(out.size).toBe(380 * KB);
  });

  it('uses the first result under the 500 KB cap when nothing reaches the 400 KB aim', async () => {
    // The first try is the biggest (480 KB, under the cap of 500,000 bytes); every later one
    // is smaller (450 KB), but the first is the best picture, so it is the one kept.
    const picture = fakePicture(4000, 3000, (a) =>
      a.width === 1600 && a.quality === 0.85 ? 480 * KB : 450 * KB,
    );
    const out = await squeezeImage(file('a.jpg'), {}, decodeTo(picture));
    // Every attempt was made (none reached the aim)…
    expect(picture.calls).toHaveLength(squeezeAttempts(4000, 3000).length);
    // …and the one used is the first that fitted under the cap.
    expect(out.size).toBe(480 * KB);
  });

  it('refuses a photo it cannot get under 500 KB, saying it is too big', async () => {
    const picture = fakePicture(4000, 3000, () => 700 * KB);
    await expect(squeezeImage(file('a.jpg'), {}, decodeTo(picture))).rejects.toMatchObject({
      name: 'ImageRejected',
      reason: 'size',
    });
    expect(picture.released).toBe(1);
  });

  it('never returns a file over the cap, whatever the aim says', async () => {
    const picture = fakePicture(4000, 3000, () => 450 * KB);
    // An aim above the cap would let 450 KB through; the cap still stands.
    await expect(
      squeezeImage(file('a.jpg'), { targetBytes: 600 * KB, maxBytes: 400 * KB }, decodeTo(picture)),
    ).rejects.toMatchObject({ reason: 'size' });
  });

  it('takes its aim and cap from the caller when given them', async () => {
    const picture = fakePicture(4000, 3000, (a) => (a.quality === 0.85 ? 1500 : 900));
    const out = await squeezeImage(
      file('a.jpg'),
      { targetBytes: 1000, maxBytes: 2000 },
      decodeTo(picture),
    );
    expect(out.size).toBe(900);
    expect(picture.calls).toHaveLength(2);
  });

  it('skips an attempt the browser could not draw and carries on', async () => {
    const picture = fakePicture(4000, 3000, (a) => (a.quality === 0.85 ? null : 200 * KB));
    const out = await squeezeImage(file('a.jpg'), {}, decodeTo(picture));
    expect(picture.calls).toHaveLength(2);
    expect(out.size).toBe(200 * KB);
  });

  it('treats a drawing that throws like one that gave nothing', async () => {
    const picture = fakePicture(4000, 3000, () => 200 * KB);
    const real = picture.encode;
    let first = true;
    picture.encode = async (w, h, q) => {
      if (first) {
        first = false;
        throw new Error('out of memory');
      }
      return real(w, h, q);
    };
    const out = await squeezeImage(file('a.jpg'), {}, decodeTo(picture));
    expect(out.size).toBe(200 * KB);
  });

  it('refuses a picture the browser cannot draw at all, as unreadable', async () => {
    const picture = fakePicture(4000, 3000, () => null);
    await expect(squeezeImage(file('a.jpg'), {}, decodeTo(picture))).rejects.toMatchObject({
      reason: 'unreadable',
    });
    expect(picture.released).toBe(1);
  });

  it('treats an empty result as nothing', async () => {
    const picture = fakePicture(4000, 3000, () => 0);
    await expect(squeezeImage(file('a.jpg'), {}, decodeTo(picture))).rejects.toMatchObject({
      reason: 'unreadable',
    });
  });

  it('refuses a picture with no size, and still lets go of it', async () => {
    const picture = fakePicture(0, 0, () => 100 * KB);
    await expect(squeezeImage(file('a.jpg'), {}, decodeTo(picture))).rejects.toMatchObject({
      reason: 'unreadable',
    });
    expect(picture.calls).toHaveLength(0);
    expect(picture.released).toBe(1);
  });
});

describe('squeezeImage — a file that cannot be opened', () => {
  const failing = async () => {
    throw new Error('cannot decode');
  };

  it('says it is a phone-format photo when a HEIC cannot be opened, by type or by name', async () => {
    await expect(squeezeImage(file('IMG_1.jpg', 'image/heic'), {}, failing)).rejects.toMatchObject({
      reason: 'heic',
    });
    await expect(squeezeImage(file('IMG_1.HEIC', ''), {}, failing)).rejects.toMatchObject({
      reason: 'heic',
    });
    await expect(
      squeezeImage(file('IMG_1.heif', 'image/heif'), {}, failing),
    ).rejects.toBeInstanceOf(ImageRejected);
  });

  it('says it could not be read for anything else', async () => {
    await expect(squeezeImage(file('a.jpg'), {}, failing)).rejects.toMatchObject({
      reason: 'unreadable',
    });
  });

  it('knows a HEIC by its type or its name', () => {
    expect(looksLikeHeic(file('x', 'image/heic'))).toBe(true);
    expect(looksLikeHeic(file('x', 'image/HEIF; charset=x'))).toBe(true);
    expect(looksLikeHeic(file('photo.HEIC', ''))).toBe(true);
    expect(looksLikeHeic(file('photo.jpg', 'image/jpeg'))).toBe(false);
  });
});

describe('squeezeImage — the name of what comes out', () => {
  it('is the picture\'s own name with ".jpg", or "photo.jpg" when it had none', async () => {
    const picture = () => fakePicture(1000, 800, () => 50 * KB);
    expect(
      (await squeezeImage(file('washroom.png', 'image/png'), {}, decodeTo(picture()))).name,
    ).toBe('washroom.jpg');
    expect((await squeezeImage(file('', ''), {}, decodeTo(picture()))).name).toBe('photo.jpg');
  });
});

describe('squeezeImage — the real canvas, stubbed', () => {
  const bitmapClose = vi.fn();
  let drawn: Array<[number, number, number, number]> = [];
  let whitened = 0;
  let qualities: number[] = [];
  let sizeOf = (_width: number) => 100 * KB;

  beforeEach(() => {
    drawn = [];
    whitened = 0;
    qualities = [];
    sizeOf = () => 100 * KB;
    bitmapClose.mockReset();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3000, height: 2000, close: bitmapClose })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      fillStyle: '',
      fillRect: () => {
        whitened += 1;
      },
      drawImage: (_b: unknown, x: number, y: number, w: number, h: number) =>
        drawn.push([x, y, w, h]),
    })) as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      _type?: string,
      quality?: number,
    ) {
      qualities.push(quality ?? -1);
      cb(new Blob([new Uint8Array(sizeOf(this.width))], { type: 'image/jpeg' }));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the picture at the size asked for and saves it as a JPEG at 0.85 first', async () => {
    const out = await squeezeImage(file('IMG_7.jpg', 'image/jpeg', 2 * 1024 * 1024));
    expect(drawn).toEqual([[0, 0, 1600, 1067]]);
    // A white sheet first, so a PNG's clear parts do not turn black in a JPEG.
    expect(whitened).toBe(1);
    expect(qualities).toEqual([0.85]);
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBe(100 * KB);
    // The picture's memory is let go once it is done.
    expect(bitmapClose).toHaveBeenCalledTimes(1);
  });

  it('draws again smaller when the first size will not go under the aim', async () => {
    sizeOf = (width) => (width >= 1600 ? 700 * KB : 350 * KB);
    const out = await squeezeImage(file('IMG_7.jpg'));
    expect(drawn.map(([, , w]) => w)).toEqual([1600, 1600, 1600, 1600, 1280]);
    expect(qualities).toEqual([0.85, 0.75, 0.65, 0.55, 0.85]);
    expect(out.size).toBe(350 * KB);
  });

  it('asks the browser for the photo turned the way the phone was held', async () => {
    const open = vi.fn(async () => ({ width: 3000, height: 2000, close: bitmapClose }));
    vi.stubGlobal('createImageBitmap', open);
    const picked = file('IMG_7.jpg');
    await squeezeImage(picked);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(picked, { imageOrientation: 'from-image' });
  });

  it('still opens a photo in a browser that throws on that option, by asking again without it', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('not a valid enum value'))
      .mockResolvedValueOnce({ width: 3000, height: 2000, close: bitmapClose });
    vi.stubGlobal('createImageBitmap', open);
    const out = await squeezeImage(file('IMG_7.jpg'));
    expect(open).toHaveBeenCalledTimes(2);
    expect(out.type).toBe('image/jpeg');
  });

  it('refuses in plain terms when this browser cannot open pictures at all', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(squeezeImage(file('IMG_7.jpg'))).rejects.toMatchObject({ reason: 'unreadable' });
    await expect(squeezeImage(file('IMG_7.HEIC', ''))).rejects.toMatchObject({ reason: 'heic' });
  });

  it('refuses a picture the browser starts to open and cannot finish', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('The source image could not be decoded.');
      }),
    );
    await expect(squeezeImage(file('IMG_7.heic', 'image/heic'))).rejects.toMatchObject({
      reason: 'heic',
    });
  });
});
