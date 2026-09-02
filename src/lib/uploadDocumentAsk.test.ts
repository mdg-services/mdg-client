import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ post: vi.fn(), compressImage: vi.fn() }));

vi.mock('./api', () => ({ api: { post: h.post } }));
vi.mock('./compressImage', () => ({ compressImage: h.compressImage }));

const {
  DOCUMENT_ASK_ACCEPT,
  isAskFileTooBig,
  prepareAskFile,
  resolveAskFile,
  uploadDocumentAsk,
} = await import('./uploadDocumentAsk');

/**
 * The one upload path that is not a copy of the other five.
 *
 * What is worth testing here is the part that is genuinely different from every
 * other upload in this app: an ask can be a PDF. Every other camera path may
 * assume a picture and does; assuming one here labels a scanned fire NOC as
 * `image/jpeg`, the submit route's enum refuses it after the bytes have already
 * gone, and the dealer is told their document is not a document.
 */

function file(name: string, type: string, bytes = 3): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function presigned(storageKey = 'ask/d1/ask-1/abc.jpg') {
  return { uploadUrl: 'https://bucket.example/put', storageKey, expiresIn: 900 };
}

beforeEach(() => {
  h.post.mockResolvedValue(presigned());
  h.compressImage.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  h.post.mockReset();
  h.compressImage.mockReset();
});

describe('what an ask will accept', () => {
  it('takes the four types the shared declaration names', () => {
    expect(resolveAskFile(file('a.jpg', 'image/jpeg'))).toEqual({
      contentType: 'image/jpeg',
      kind: 'image',
    });
    expect(resolveAskFile(file('a.png', 'image/png'))?.contentType).toBe('image/png');
    expect(resolveAskFile(file('a.webp', 'image/webp'))?.contentType).toBe('image/webp');
    // A PDF is a `file`, not an `image`: the reviewer cannot render it in place.
    expect(resolveAskFile(file('noc.pdf', 'application/pdf'))).toEqual({
      contentType: 'application/pdf',
      kind: 'file',
    });
  });

  /**
   * The failure this exists for. An Android picker hands back a `File` with an
   * EMPTY type; assuming an image would send a scan as `image/jpeg`.
   */
  it('recovers a PDF whose picker gave it no type at all', () => {
    expect(resolveAskFile(file('fire-noc.pdf', ''))).toEqual({
      contentType: 'application/pdf',
      kind: 'file',
    });
  });

  /**
   * The only place an assumption is allowed: a camera capture arrives with an
   * empty type AND an empty name, so there is nothing left to read — but the tap
   * that produced it was a tap on a camera.
   */
  it('assumes a photograph only when the camera took it', () => {
    expect(resolveAskFile(file('', ''), { fromCamera: true })).toEqual({
      contentType: 'image/jpeg',
      kind: 'image',
    });
    expect(resolveAskFile(file('', ''))).toBeNull();
  });

  /**
   * HEIC is refused for the reason the shared declaration gives: a browser
   * canvas cannot decode it, so it can neither be shrunk before it is sent nor
   * shown back to whoever has to check it.
   */
  it('refuses what MDG could not open', () => {
    expect(resolveAskFile(file('holiday.heic', 'image/heic'))).toBeNull();
    expect(resolveAskFile(file('clip.mp4', 'video/mp4'))).toBeNull();
  });

  it('offers exactly those four types to the file picker', () => {
    expect(DOCUMENT_ASK_ACCEPT).toBe('image/jpeg,image/png,image/webp,application/pdf');
  });

  it('refuses a file too big to finish uploading from a forecourt', () => {
    expect(isAskFileTooBig(file('scan.pdf', 'application/pdf', 11 * 1024 * 1024))).toBe(true);
    expect(isAskFileTooBig(file('page.jpg', 'image/jpeg', 400 * 1024))).toBe(false);
  });
});

describe('preparing and sending', () => {
  it('presigns against the ask scope, this dealer and this ask', async () => {
    const photo = await prepareAskFile(file('page.jpg', 'image/jpeg'), 'image/jpeg');
    await uploadDocumentAsk({ photo, kind: 'image', dealerId: 'd1', askId: 'ask-1' });

    expect(h.post).toHaveBeenCalledWith(
      '/v1/uploads/sign',
      expect.objectContaining({ scope: 'ask', dealerId: 'd1', askId: 'ask-1' }),
    );
  });

  /** A multi-page scan is never flattened or re-encoded. */
  it('leaves a PDF alone', async () => {
    const photo = await prepareAskFile(file('noc.pdf', 'application/pdf'), 'application/pdf');
    const attachment = await uploadDocumentAsk({
      photo,
      kind: 'file',
      dealerId: 'd1',
      askId: 'ask-1',
    });
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.kind).toBe('file');
  });

  /**
   * The record must describe the bytes that were actually PUT. Storing the
   * camera's 6 MB against a 200 KB object is how a record stops matching the
   * object it points at.
   */
  it('describes the shrunk file, not the one off the camera', async () => {
    h.compressImage.mockResolvedValue(file('page-small.jpg', 'image/jpeg', 10));
    const photo = await prepareAskFile(file('page.jpg', 'image/jpeg', 5000), 'image/jpeg');
    const attachment = await uploadDocumentAsk({
      photo,
      kind: 'image',
      dealerId: 'd1',
      askId: 'ask-1',
    });
    expect(attachment.filename).toBe('page-small.jpg');
    expect(attachment.size).toBe(10);
  });

  it('gives an empty-named camera capture a filename the presign will take', async () => {
    const photo = await prepareAskFile(file('', ''), 'image/jpeg');
    expect(photo.filename).toBe('paper.jpg');
  });

  /**
   * A resolved key for bytes that never landed would mark the ask sent against
   * an object that is not in the bucket: an admin opens a broken image, and the
   * dealer has been told their paper is with MDG.
   */
  it('throws when the bucket refuses the bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }),
    );
    const photo = await prepareAskFile(file('page.jpg', 'image/jpeg'), 'image/jpeg');
    await expect(
      uploadDocumentAsk({ photo, kind: 'image', dealerId: 'd1', askId: 'ask-1' }),
    ).rejects.toThrow(/403/);
  });

  it('returns the key the server issued, never one composed here', async () => {
    h.post.mockResolvedValue(presigned('ask/d9/ask-9/xyz.jpg'));
    const photo = await prepareAskFile(file('p.jpg', 'image/jpeg'), 'image/jpeg');
    const attachment = await uploadDocumentAsk({
      photo,
      kind: 'image',
      dealerId: 'd9',
      askId: 'ask-9',
    });
    expect(attachment.storageKey).toBe('ask/d9/ask-9/xyz.jpg');
  });
});
