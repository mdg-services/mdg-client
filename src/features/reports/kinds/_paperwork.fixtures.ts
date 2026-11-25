import type { Attachment, ReportDetail, ReportKind } from '@dk/shared/types';

/** A minimal report as the server sends it, for the overlay tests of the paperwork kinds. */
export function reportOf(kind: ReportKind, attachments: Attachment[] = []): ReportDetail {
  return {
    id: 'm1',
    kind,
    status: 'ok',
    sentAt: '2026-11-24T08:00:00.000Z',
    headline: '',
    attachments,
    conversationId: 'c1',
    messageId: 'm1',
    live: {},
  };
}

/** A signed copy of a stored photo, as `GET /v1/me/reports/:id` puts it in `attachments`. */
export function signedPhoto(storageKey: string, url: string): Attachment {
  return { storageKey, filename: `${storageKey}.jpg`, contentType: 'image/jpeg', size: 1000, kind: 'image', url };
}
