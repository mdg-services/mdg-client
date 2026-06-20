import type { Attachment } from './conversation';

/** Categories of records delivered to a dealer. 'dsr' = Daily Sales Report. */
export type RecordType = 'dsr' | 'invoice' | 'compliance' | 'statement' | 'other';

export const RECORD_TYPES: RecordType[] = ['dsr', 'invoice', 'compliance', 'statement', 'other'];

/** Human-friendly labels for each record type (client-facing, plain language). */
export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  dsr: 'Daily Sales Report',
  invoice: 'Invoice',
  compliance: 'Compliance',
  statement: 'Statement',
  other: 'Document',
};

export interface DealerRecord {
  id: string;
  dealerId: string;
  type: RecordType;
  /** Short title shown on the card, e.g. "Daily Sales Report". */
  title: string;
  /** The period this record covers, e.g. "14 Mar 2026" or "March 2026". */
  periodLabel?: string;
  /** Optional free-text note from the staff member who uploaded it. */
  note?: string;
  attachment: Attachment;
  uploadedByAdminId: string;
  uploadedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight reference embedded on a chat message so it can render a record card. */
export interface RecordCard {
  kind: 'record';
  recordId: string;
  recordType: RecordType;
  title: string;
  periodLabel?: string;
}
