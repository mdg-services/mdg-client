import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@/lib/api';

import {
  DU_OTP_PAPER_MAX_BYTES,
  PaperRejected,
  paperContentType,
  prepareDuOtpPaper,
  uploadDuOtpPaper,
} from './uploadDuOtpPaper';

const h = vi.hoisted(() => ({ post: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { post: h.post },
}));

/** A file of `size` bytes with an explicit (possibly empty) type. */
function file(name: string, type: string, size = 3): File {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  h.post.mockReset();
  h.post.mockResolvedValue({
    uploadUrl: 'https://s3.example.test/put?sig=1',
    storageKey: 'dealers/d1/du-otp/abc.pdf',
    expiresIn: 900,
  });
  h.fetch.mockReset();
  h.fetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
  vi.stubGlobal('fetch', h.fetch);
});

describe('paperContentType', () => {
  it('trusts the type the phone gave', () => {
    expect(paperContentType(file('a.pdf', 'application/pdf'))).toBe('application/pdf');
    expect(paperContentType(file('a.png', 'IMAGE/PNG'))).toBe('image/png');
    expect(paperContentType(file('a.jpg', 'image/jpg'))).toBe('image/jpeg');
  });

  it('recovers a PDF from its name when an Android picker gave no type', () => {
    expect(paperContentType(file('Certificate.PDF', ''))).toBe('application/pdf');
  });

  it('recovers a photo from its extension, and gives up on anything else', () => {
    expect(paperContentType(file('IMG_1.JPG', ''))).toBe('image/jpeg');
    expect(paperContentType(file('notes', ''))).toBe('application/octet-stream');
  });
});

describe('prepareDuOtpPaper', () => {
  it('sends a PDF exactly as it is', async () => {
    const pdf = file('cert.pdf', 'application/pdf', 1000);
    const prepared = await prepareDuOtpPaper(pdf);
    expect(prepared).toEqual({
      file: pdf,
      filename: 'cert.pdf',
      contentType: 'application/pdf',
      size: 1000,
    });
  });

  it('names a PDF that came with no name', async () => {
    const prepared = await prepareDuOtpPaper(file('', 'application/pdf'));
    expect(prepared.filename).toBe('document.pdf');
  });

  it('turns away a PDF over 10 MB, before anything is sent', async () => {
    await expect(
      prepareDuOtpPaper(file('big.pdf', 'application/pdf', DU_OTP_PAPER_MAX_BYTES + 1)),
    ).rejects.toMatchObject({ name: 'PaperRejected', reason: 'size' });
    expect(h.post).not.toHaveBeenCalled();
  });

  it('takes a PDF of exactly 10 MB', async () => {
    await expect(
      prepareDuOtpPaper(file('edge.pdf', 'application/pdf', DU_OTP_PAPER_MAX_BYTES)),
    ).resolves.toMatchObject({ size: DU_OTP_PAPER_MAX_BYTES });
  });

  it.each([
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['clip.mp4', 'video/mp4'],
    ['anim.gif', 'image/gif'],
    ['scan.bmp', 'image/bmp'],
    ['data', ''],
  ])('turns away %s as the wrong kind of file', async (name, type) => {
    const err = await prepareDuOtpPaper(file(name, type)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaperRejected);
    expect((err as PaperRejected).reason).toBe('type');
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])('takes a %s photo', async (type) => {
    const photo = file('p', type);
    const prepared = await prepareDuOtpPaper(photo);
    expect(prepared.contentType).toBe(type);
    expect(prepared.file).toBe(photo);
  });

  it('turns away an iPhone photo the phone could not turn into a JPEG', async () => {
    // jsdom has no createImageBitmap, so the shared preparation keeps the HEIC as it is.
    const err = await prepareDuOtpPaper(file('IMG.HEIC', 'image/heic')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaperRejected);
    expect((err as PaperRejected).reason).toBe('type');
  });

  it('turns away a photo over 10 MB even after the shared shrink had its chance', async () => {
    const err = await prepareDuOtpPaper(file('huge.jpg', 'image/jpeg', DU_OTP_PAPER_MAX_BYTES + 1)).catch(
      (e: unknown) => e,
    );
    expect((err as PaperRejected).reason).toBe('size');
  });
});

describe('uploadDuOtpPaper', () => {
  it('presigns with scope du-otp and the outlet, PUTs the bytes, and returns the key the server issued', async () => {
    const pdf = file('cert.pdf', 'application/pdf', 4321);
    const out = await uploadDuOtpPaper(pdf, 'd1');

    expect(h.post).toHaveBeenCalledWith('/v1/uploads/sign', {
      filename: 'cert.pdf',
      contentType: 'application/pdf',
      size: 4321,
      scope: 'du-otp',
      dealerId: 'd1',
    });
    expect(h.fetch).toHaveBeenCalledWith('https://s3.example.test/put?sig=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
    });
    expect(out).toEqual({ key: 'dealers/d1/du-otp/abc.pdf', filename: 'cert.pdf' });
  });

  it('signs a photo as the photo it is', async () => {
    await uploadDuOtpPaper(file('slip.jpg', 'image/jpeg', 2000), 'd1');
    expect(h.post.mock.calls[0]![1]).toMatchObject({
      contentType: 'image/jpeg',
      size: 2000,
      scope: 'du-otp',
    });
  });

  it('cuts a very long file name to the 255 characters the answer takes', async () => {
    const long = `${'x'.repeat(300)}.pdf`;
    const out = await uploadDuOtpPaper(file(long, 'application/pdf'), 'd1');
    expect(out.filename).toHaveLength(255);
  });

  it('throws when the bytes were refused, so no answer is made for a file that is not there', async () => {
    h.fetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    await expect(uploadDuOtpPaper(file('cert.pdf', 'application/pdf'), 'd1')).rejects.toThrow(
      'Upload failed: 403 Forbidden',
    );
  });

  it('sends nothing at all for a file that was turned away', async () => {
    await expect(uploadDuOtpPaper(file('x.docx', 'application/msword'), 'd1')).rejects.toBeInstanceOf(PaperRejected);
    expect(h.post).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
