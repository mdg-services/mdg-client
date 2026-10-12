/**
 * What kind of paper a file is, for the coloured badge on a document row.
 *
 * Decided from the name first and the MIME second: a PDF a phone hands over with
 * an empty or generic type (`application/octet-stream`) is still a PDF, and the
 * dealer reads the extension, not the MIME.
 */
export type FileFlavour = 'pdf' | 'doc' | 'xls' | 'other';

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function fileFlavour(filename: string, contentType?: string): FileFlavour {
  const ext = extensionOf(filename);
  const mime = (contentType ?? '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    ext === 'doc' ||
    ext === 'docx' ||
    mime === 'application/msword' ||
    mime.includes('wordprocessingml')
  ) {
    return 'doc';
  }
  if (
    ext === 'xls' ||
    ext === 'xlsx' ||
    ext === 'xlsm' ||
    ext === 'csv' ||
    mime === 'application/vnd.ms-excel' ||
    mime.includes('spreadsheetml')
  ) {
    return 'xls';
  }
  return 'other';
}

/** The word on the badge: PDF, DOC, XLS, or the file's own extension. */
export function fileTypeLabel(filename: string, contentType?: string): string {
  const flavour = fileFlavour(filename, contentType);
  if (flavour === 'pdf') return 'PDF';
  if (flavour === 'doc') return 'DOC';
  if (flavour === 'xls') return 'XLS';
  const ext = extensionOf(filename);
  return ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE';
}
