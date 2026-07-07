import { describe, expect, it } from 'vitest';

import { attachmentKindFor, resolveFileType } from './uploadAttachment';

/** Build a File with an explicit (possibly empty) MIME type. */
function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('attachmentKindFor', () => {
  it('classifies by MIME prefix', () => {
    expect(attachmentKindFor('image/png')).toBe('image');
    expect(attachmentKindFor('audio/webm')).toBe('audio');
    expect(attachmentKindFor('application/pdf')).toBe('file');
    expect(attachmentKindFor('')).toBe('file');
  });
});

describe('resolveFileType', () => {
  it('trusts an explicit image MIME', () => {
    expect(resolveFileType(file('a.png', 'image/png'))).toEqual({
      kind: 'image',
      contentType: 'image/png',
    });
  });

  it('strips codec suffixes and lowercases an explicit MIME', () => {
    expect(resolveFileType(file('a.webm', 'AUDIO/WEBM;codecs=opus'))).toEqual({
      kind: 'audio',
      contentType: 'audio/webm',
    });
  });

  it('recovers image kind from the extension when the MIME is empty (Android WebView)', () => {
    // The exact failure the fix targets: an empty File.type must NOT become a
    // generic file, or the image loses its thumbnail + lightbox.
    expect(resolveFileType(file('IMG_0421.JPG', ''))).toEqual({
      kind: 'image',
      contentType: 'image/jpeg',
    });
    expect(resolveFileType(file('photo.heic', ''))).toEqual({
      kind: 'image',
      contentType: 'image/heic',
    });
  });

  it('recovers audio kind from the extension when the MIME is empty', () => {
    expect(resolveFileType(file('note.m4a', ''))).toEqual({
      kind: 'audio',
      contentType: 'audio/mp4',
    });
  });

  it('assumes an image for camera captures with no usable type or extension', () => {
    expect(resolveFileType(file('', ''), { assumeImage: true })).toEqual({
      kind: 'image',
      contentType: 'image/jpeg',
    });
  });

  it('falls back to a generic binary type for an unknown empty-MIME file', () => {
    expect(resolveFileType(file('data', ''))).toEqual({
      kind: 'file',
      contentType: 'application/octet-stream',
    });
  });

  it('keeps a known non-media MIME as a file without misclassifying', () => {
    expect(resolveFileType(file('report.pdf', 'application/pdf'))).toEqual({
      kind: 'file',
      contentType: 'application/pdf',
    });
  });
});
