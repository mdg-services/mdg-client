import { Check, ChevronRight } from 'lucide-react';

import { STRIP_LABEL_KEYS, stripCaptionKey, stripVisible } from '@/features/setup/stripView';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { SetupStripState } from '@dk/shared/types';

/**
 * Where setup stands, read-only, while an outlet is on its way to live: the five
 * steps with a tick on each one that is done, the one line saying what is
 * happening now, and a way into the chat, where the boxes that do the work stay.
 *
 * Nothing here saves anything. It draws from the same view as the chat's own
 * strip, and draws nothing at all for an outlet that is live or was never set up
 * this way, so a dealer past setup never sees it.
 */
export function SetupSummary({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const q = useOutletSetup();
  const view = q.data;
  if (!stripVisible(view)) return null;
  const caption = stripCaptionKey(view);
  // A server that sends a step this app has no words for is drawn without it.
  const steps = view.strip.filter(({ step }) => step in STRIP_LABEL_KEYS);
  const done = steps.filter((s) => s.state === 'done').length;

  return (
    <section
      data-testid="today-setup"
      aria-label={t('setup.stripLabel')}
      className="overflow-hidden rounded-2xl border border-wa-divider bg-wa-in shadow-sm"
    >
      <div className="px-3.5 pb-1 pt-3">
        <h2 className="text-heading text-wa-bar-text">{t('setup.stripLabel')}</h2>
        {caption ? (
          <p className="mt-0.5 text-body text-wa-meta">{t(caption)}</p>
        ) : null}
      </div>
      <ol className="flex gap-1 px-2.5 pb-2 pt-2" aria-label={`${done}/${steps.length}`}>
        {steps.map(({ step, state }) => (
          <li
            key={step}
            data-step={step}
            data-state={state}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5"
          >
            <StepDot state={state} />
            <span
              className={cn(
                'break-words text-center text-meta',
                state === 'current' ? 'font-medium text-wa-bar-text' : 'text-wa-meta',
                state === 'skipped' && 'line-through',
              )}
            >
              {t(STRIP_LABEL_KEYS[step])}
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-12 w-full items-center justify-between border-t border-wa-divider px-3.5 py-2 text-cta text-wa-accent-strong active:bg-wa-row-active"
      >
        {t('today.setup.continue')}
        <ChevronRight width={18} strokeWidth={2} aria-hidden />
      </button>
    </section>
  );
}

function StepDot({ state }: { state: SetupStripState }) {
  const base = 'grid h-6 w-6 place-items-center rounded-full';
  if (state === 'done') {
    return (
      <span className={cn(base, 'bg-wa-accent text-white')} aria-hidden>
        <Check width={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (state === 'current') {
    return <span className={cn(base, 'border-2 border-wa-accent bg-wa-in')} aria-hidden />;
  }
  return <span className={cn(base, 'border border-wa-divider bg-wa-row-active')} aria-hidden />;
}
