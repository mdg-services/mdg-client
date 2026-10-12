import { describe, expect, it } from 'vitest';

import { fileFlavour, fileTypeLabel } from './fileKind';

describe('fileFlavour', () => {
  it('knows a PDF by its name or its type', () => {
    expect(fileFlavour('rates.pdf')).toBe('pdf');
    expect(fileFlavour('RATES.PDF')).toBe('pdf');
    expect(fileFlavour('scan', 'application/pdf')).toBe('pdf');
  });

  it('knows Word files, old and new', () => {
    expect(fileFlavour('a.doc')).toBe('doc');
    expect(fileFlavour('a.docx')).toBe('doc');
    expect(
      fileFlavour(
        'x',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('doc');
  });

  it('knows spreadsheets, including the macro ones and csv', () => {
    expect(fileFlavour('a.xls')).toBe('xls');
    expect(fileFlavour('a.xlsx')).toBe('xls');
    expect(fileFlavour('15E FINAL.xlsm')).toBe('xls');
    expect(fileFlavour('a.csv')).toBe('xls');
    expect(
      fileFlavour('x', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe('xls');
  });

  it('reads the name before a generic type', () => {
    // A phone that hands over a PDF as an unnamed blob is still a PDF.
    expect(fileFlavour('rates.pdf', 'application/octet-stream')).toBe('pdf');
  });

  it('calls everything else other', () => {
    expect(fileFlavour('notes.txt', 'text/plain')).toBe('other');
    expect(fileFlavour('noextension')).toBe('other');
  });
});

describe('fileTypeLabel', () => {
  it('prints PDF / DOC / XLS for the three, and the extension for the rest', () => {
    expect(fileTypeLabel('a.pdf')).toBe('PDF');
    expect(fileTypeLabel('a.docx')).toBe('DOC');
    expect(fileTypeLabel('a.xlsx')).toBe('XLS');
    expect(fileTypeLabel('notes.txt')).toBe('TXT');
  });

  it('falls back to FILE when there is no short extension to show', () => {
    expect(fileTypeLabel('noextension')).toBe('FILE');
    expect(fileTypeLabel('archive.verylongext')).toBe('FILE');
  });
});
