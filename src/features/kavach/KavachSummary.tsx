import { useLang, useT } from '@/lib/i18n';
import type { KavachDealerView } from '@dk/shared/types';

import { countsOf, pctOf, sentenceOf } from './kavachView';

const R = 52;
const C = 2 * Math.PI * R;

/**
 * The top of the Kavach tab (ADR 0057 §5): a ring with the % done in the big figure type, one
 * plain sentence about today, and the three counts. One ruled white sheet, no shadow. The ring
 * is a picture of the number beside it, never the only place the number is: a screen reader
 * gets the figure and the sentence in words.
 */
export function KavachSummary({ view }: { view: KavachDealerView }) {
  const t = useT();
  const lang = useLang();
  const pct = pctOf(view);
  const counts = countsOf(view);
  const sentence = sentenceOf(view, lang);
  const filled = pct === null ? 0 : (C * pct) / 100;
  return (
    <section
      aria-label={t('kavach.page')}
      data-testid="kavach-summary"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative size-32 shrink-0 text-kind-kavach-ink" data-testid="kavach-ring">
          <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden focusable="false">
            <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="11" />
            <circle
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${C}`}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-display tabular-nums text-text"
            data-testid="kavach-pct"
            {...(pct !== null ? { role: 'img', 'aria-label': t('kavach.ring', { pct }) } : {})}
          >
            {pct === null ? '–' : `${pct}%`}
          </span>
        </div>
        <p className="min-w-[10rem] flex-1 break-words text-heading text-text" data-testid="kavach-sentence">
          {sentence}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3 text-center">
        <Count label={t('kavach.count.done')} value={counts.done} testId="kavach-count-done" />
        <Count label={t('kavach.count.sent')} value={counts.sent} testId="kavach-count-sent" />
        <Count label={t('kavach.count.todo')} value={counts.todo} testId="kavach-count-todo" />
      </dl>
    </section>
  );
}

function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex flex-col items-center px-1">
      <dd className="order-1 text-title tabular-nums text-text" data-testid={testId}>
        {value}
      </dd>
      <dt className="order-2 break-words text-meta text-text-muted">{label}</dt>
    </div>
  );
}
