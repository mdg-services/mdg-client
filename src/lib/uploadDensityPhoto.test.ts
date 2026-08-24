import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  post: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock('./api', () => ({ api: { post: h.post } }));
vi.mock('./compressImage', () => ({ compressImage: h.compressImage }));

const { uploadDensityPhoto } = await import('./uploadDensityPhoto');

/** Build a File with an explicit (possibly empty) MIME type and size. */
function file(name: string, type: string, bytes = 3): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** The presign response the server sends back. */
function presigned(storageKey = 'tt-density/d1/register/abc.jpg') {
  return { uploadUrl: 'https://bucket.example/put', storageKey, expiresIn: 900 };
}

const putOk = { ok: true, status: 200, statusText: 'OK' };

describe('uploadDensityPhoto', () => {
  beforeEach(() => {
    h.post.mockResolvedValue(presigned());
    h.compressImage.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(putOk));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    h.post.mockReset();
    h.compressImage.mockReset();
  });

  it('presigns against the tt-density scope and the dealer', async () => {
    await uploadDensityPhoto(file('page.jpg', 'image/jpeg'), 'dealer-1');
    expect(h.post).toHaveBeenCalledWith(
      '/v1/uploads/sign',
      expect.objectContaining({ scope: 'tt-density', dealerId: 'dealer-1' }),
    );
  });

  /**
   * The exact failure this guards: an Android WebView camera capture arrives
   * with `type === ''`, presigns as application/octet-stream, and the server
   * refuses it because the register page must be an image.
   */
  it('recovers the content type when the camera hands back an empty MIME', async () => {
    const photo = await uploadDensityPhoto(file('', ''), 'dealer-1');
    expect(h.post).toHaveBeenCalledWith(
      '/v1/uploads/sign',
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    expect(photo.contentType).toBe('image/jpeg');
  });

  it('falls back to a filename when the camera hands back an empty one', async () => {
    const photo = await uploadDensityPhoto(file('', ''), 'dealer-1');
    expect(photo.filename).toBe('register.jpg');
    expect(h.post).toHaveBeenCalledWith(
      '/v1/uploads/sign',
      expect.objectContaining({ filename: 'register.jpg' }),
    );
  });

  /**
   * The record must describe the bytes that were actually PUT, not the ones the
   * camera produced — otherwise the server stores a 6 MB size against a 200 KB
   * object.
   */
  it('reports the compressed file when compression is worth it', async () => {
    h.compressImage.mockResolvedValue(file('page-small.jpg', 'image/jpeg', 10));
    const photo = await uploadDensityPhoto(
      file('page.jpg', 'image/jpeg', 5000),
      'dealer-1',
    );
    expect(photo.filename).toBe('page-small.jpg');
    expect(photo.size).toBe(10);
    expect(h.post).toHaveBeenCalledWith(
      '/v1/uploads/sign',
      expect.objectContaining({ filename: 'page-small.jpg', size: 10 }),
    );
  });

  it('keeps the original when compressImage declines', async () => {
    const original = file('page.jpg', 'image/jpeg', 4242);
    const photo = await uploadDensityPhoto(original, 'dealer-1');
    expect(photo.filename).toBe('page.jpg');
    expect(photo.size).toBe(4242);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: original,
    });
  });

  it('returns the key the server issued', async () => {
    h.post.mockResolvedValue(presigned('tt-density/d9/register/xyz.jpg'));
    const photo = await uploadDensityPhoto(file('p.jpg', 'image/jpeg'), 'd9');
    expect(photo.storageKey).toBe('tt-density/d9/register/xyz.jpg');
  });

  /**
   * A failed PUT must throw rather than resolve. A resolved key for bytes that
   * never landed would mark the day done against an object that is not there.
   */
  it('throws when the bucket refuses the bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }),
    );
    await expect(
      uploadDensityPhoto(file('p.jpg', 'image/jpeg'), 'd1'),
    ).rejects.toThrow(/403/);
  });
});
