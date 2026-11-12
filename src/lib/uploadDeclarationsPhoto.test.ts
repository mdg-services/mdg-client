import { describe, expect, it, vi } from 'vitest';

import { ImageRejected } from './squeezeImage';
import { prepareDeclarationsPhoto, uploadDeclarationsPhoto } from './uploadDeclarationsPhoto';

const h = vi.hoisted(() => ({ squeeze: vi.fn(), presign: vi.fn() }));
vi.mock('./squeezeImage', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  squeezeImage: h.squeeze,
}));
vi.mock('./uploadCommon', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  presignAndPut: h.presign,
}));

const KB = 1024;
const picked = (name: string, type: string, bytes = 8) =>
  new File([new Uint8Array(bytes)], name, { type });
const squeezed = (bytes: number) =>
  new File([new Uint8Array(bytes)], 'x.jpg', { type: 'image/jpeg' });

function setup(bytes = 300 * KB) {
  h.squeeze.mockReset();
  h.squeeze.mockResolvedValue(squeezed(bytes));
  h.presign.mockReset();
  h.presign.mockResolvedValue('declarations/d1/uploads/abc');
}

describe('prepareDeclarationsPhoto', () => {
  it('turns a file that is not a picture away before anything else happens', async () => {
    setup();
    await expect(
      prepareDeclarationsPhoto(picked('form.pdf', 'application/pdf'), 'outside'),
    ).rejects.toMatchObject({ name: 'ImageRejected', reason: 'type' });
    expect(h.squeeze).not.toHaveBeenCalled();
  });

  it('squeezes a picture and names it for the photo it is, in the JPEG it now is', async () => {
    setup(300 * KB);
    const photo = await prepareDeclarationsPhoto(picked('IMG_7.png', 'image/png'), 'inside');
    expect(h.squeeze).toHaveBeenCalledTimes(1);
    expect(photo).toMatchObject({
      filename: 'washroom-inside.jpg',
      contentType: 'image/jpeg',
      size: 300 * KB,
    });
    expect(photo.file.size).toBe(300 * KB);
  });

  it('lets an iPhone photo through to the squeezer, which opens it or says why not', async () => {
    setup();
    await prepareDeclarationsPhoto(picked('IMG_1.HEIC', 'image/heic'), 'outside');
    expect(h.squeeze).toHaveBeenCalledTimes(1);

    h.squeeze.mockRejectedValue(new ImageRejected('heic'));
    await expect(
      prepareDeclarationsPhoto(picked('IMG_1.HEIC', 'image/heic'), 'outside'),
    ).rejects.toMatchObject({ reason: 'heic' });
  });

  it('recovers a camera picture that came with no type, by its name or, failing that, by assuming it', async () => {
    setup();
    await prepareDeclarationsPhoto(picked('capture.jpg', ''), 'outside');
    await prepareDeclarationsPhoto(picked('', ''), 'outside');
    expect(h.squeeze).toHaveBeenCalledTimes(2);
    // A voice note's name still gives it away.
    await expect(prepareDeclarationsPhoto(picked('note.mp3', ''), 'outside')).rejects.toMatchObject(
      { reason: 'type' },
    );
  });

  it('passes the squeezer\'s refusal on, and never uploads', async () => {
    setup();
    h.squeeze.mockRejectedValue(new ImageRejected('size'));
    await expect(
      uploadDeclarationsPhoto(picked('big.jpg', 'image/jpeg'), 'd1', 'outside'),
    ).rejects.toMatchObject({ reason: 'size' });
    expect(h.presign).not.toHaveBeenCalled();
  });

  it('refuses at the last look if what came back is somehow over 500 KB', async () => {
    setup(501 * KB);
    await expect(
      prepareDeclarationsPhoto(picked('a.jpg', 'image/jpeg'), 'outside'),
    ).rejects.toMatchObject({ reason: 'size' });
  });
});

describe('uploadDeclarationsPhoto', () => {
  it('uploads under the declarations scope for the outlet and hands back the key the server issued', async () => {
    setup(280 * KB);
    const out = await uploadDeclarationsPhoto(picked('a.jpg', 'image/jpeg'), 'd1', 'outside');
    expect(out).toEqual({ key: 'declarations/d1/uploads/abc', filename: 'washroom-outside.jpg' });
    expect(h.presign).toHaveBeenCalledTimes(1);
    const [photo, target] = h.presign.mock.calls[0]!;
    expect(target).toEqual({ scope: 'declarations', dealerId: 'd1' });
    expect(photo).toMatchObject({
      filename: 'washroom-outside.jpg',
      contentType: 'image/jpeg',
      size: 280 * KB,
    });
  });
});
