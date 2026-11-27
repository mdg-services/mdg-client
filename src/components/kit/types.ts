import type { ReportStatusKey, Words } from '@/features/reports/types';

/**
 * Shapes shared by the kit. `Status` is the report status vocabulary (`ReportStatusKey`): five shapes,
 * each always drawn with a word. `Words` is the three-language sentence type the reports use.
 */
export type Status = ReportStatusKey;
export type { Words };

/** A tap target the kit draws: a label, what it does, and how loud it is. */
export interface ActionProp {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

/** Tailwind classes for a status's tint and ink. Written out in full so Tailwind sees every name. */
export const STATUS_TONE: Record<Status, { soft: string; ink: string; border: string }> = {
  problem: { soft: 'bg-status-problem-soft', ink: 'text-status-problem-ink', border: 'border-status-problem' },
  attention: { soft: 'bg-status-attention-soft', ink: 'text-status-attention-ink', border: 'border-status-attention' },
  waiting: { soft: 'bg-status-waiting-soft', ink: 'text-status-waiting-ink', border: 'border-status-waiting' },
  ok: { soft: 'bg-status-ok-soft', ink: 'text-status-ok-ink', border: 'border-status-ok' },
  info: { soft: 'bg-status-info-soft', ink: 'text-status-info-ink', border: 'border-status-info' },
};
