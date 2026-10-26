import * as React from 'react';

import { useToast } from '@/components/ui';
import { deliverDownload } from '@/lib/downloadAttachment';
import { useT } from '@/lib/i18n';
import type { GstDocumentSummary } from '@dk/shared/types';

import { fetchGstDocumentLink } from './api';
import { isTryAgainSoon } from './errors';

/**
 * The Download button of one GST invoice or credit note (ADR 0022 §11): ask the
 * server for a fresh short-lived link, then hand it to the same road a chat
 * photo takes — the Android app's own downloader, or a new tab in a browser.
 *
 * `busyId` is the document being fetched, so its button can show a spinner and
 * the others wait: a second tap while the first is still on its way would open
 * the same PDF twice over a slow link.
 *
 * In a browser the page itself is taken to the link (`sameTab`), not a new tab:
 * the link is fetched AFTER the tap, and Safari blocks a tab opened that late
 * without a word. The link carries an attachment disposition, so the browser
 * saves the file and the page stays where it is.
 *
 * The toast says "downloading", not where to: the app and a browser each save
 * the file their own way, and the screen has no business explaining either. A
 * busy invoice printer (a 503) says "try again in a minute", not "check your
 * network".
 */
export function useGstDownload(paymentId: string): {
  busyId: string | null;
  download: (doc: GstDocumentSummary) => Promise<void>;
} {
  const t = useT();
  const toast = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // State is one render behind a fast double tap; the ref is not.
  const inFlight = React.useRef(false);

  const download = React.useCallback(
    async (doc: GstDocumentSummary) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyId(doc.id);
      try {
        const file = await fetchGstDocumentLink(paymentId, doc.id);
        await deliverDownload(
          {
            url: file.url,
            filename: file.filename,
            contentType: 'application/pdf',
            kind: 'file',
          },
          { sameTab: true },
        );
        toast.info(t('payments.invoice.downloading'));
      } catch (err) {
        toast.error(
          t(isTryAgainSoon(err) ? 'payments.invoice.busy' : 'payments.invoice.downloadFailed'),
        );
      } finally {
        inFlight.current = false;
        setBusyId(null);
      }
    },
    [paymentId, t, toast],
  );

  return { busyId, download };
}
