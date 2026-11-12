import { PdfViewer } from '@/components/PdfViewer';
import {
  fetchFreshInlineUrl,
  useAttachmentDownload,
  type AttachmentSource,
} from '@/lib/downloadAttachment';
import { fetchPdfBytes } from '@/lib/pdf';
import type { Attachment } from '@dk/shared/types';

import { fileFlavour } from './fileKind';

/** A chat file the app reads itself rather than downloading: a PDF, by name or type. */
export function isPdfAttachment(attachment: Attachment): boolean {
  return fileFlavour(attachment.filename, attachment.contentType) === 'pdf';
}

/**
 * A PDF from a chat message, read inside the app. The link is signed at open
 * time through the message (the one that came with the message lasts 15
 * minutes), and Save takes the ordinary download road, toast and all.
 */
export function AttachmentPdfViewer({
  attachment,
  source,
  onClose,
}: {
  attachment: Attachment;
  source: AttachmentSource;
  onClose: () => void;
}) {
  const download = useAttachmentDownload();
  return (
    <PdfViewer
      title={attachment.filename}
      load={() => fetchFreshInlineUrl(attachment, source).then(fetchPdfBytes)}
      onSave={() => void download(attachment, source)}
      onClose={onClose}
    />
  );
}
