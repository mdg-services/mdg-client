import { Hand, RotateCw, Wrench } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { useSubmitKavachEvidence } from '@/hooks/api/useKavach';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import type { KavachItem } from '@dk/shared/types';

import { friendlyStatus, taskIcon } from './status';

/**
 * An outstanding task the dealer cannot close.
 *
 * Read-only by design, with one exception: the claim. Tapping "मैंने कर दिया"
 * posts an EMPTY body to the evidence route, which queues the task for an admin
 * to look at and moves neither the score nor the clock. It exists because a
 * screen the dealer can only read is a screen the app does things TO them from,
 * and that is the trust failure the adoption audit is written against — but the
 * button's own words and the line under it say plainly that it is a claim, not
 * a completion. Nothing here may imply the dealer finished anything.
 *
 * A HELD task gets no claim button at all. The automation that proves it could
 * not run; that is our failure, and asking the dealer to volunteer for it would
 * be charging them for our outage.
 */
export function PendingTaskCard({ item }: { item: KavachItem }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const submit = useSubmitKavachEvidence();

  const label = pick(lang, item.labelEn, item.labelHi);
  const notes = pick(
    lang,
    item.notesEn ?? item.notesHi ?? '',
    item.notesHi ?? item.notesEn ?? '',
  );
  const held = item.status === 'HELD';
  const status = friendlyStatus(item);
  const Icon = held ? Wrench : taskIcon(item.domain);

  const claim = React.useCallback(() => {
    // No proof, no note: the whole point of this call is that it carries no
    // evidence and therefore closes nothing.
    submit.mutate(
      { itemId: item.id },
      {
        onSuccess: () =>
          toast.success(t('kavach.claimSent'), {
            description: t('kavach.claimSentDesc'),
          }),
      },
    );
  }, [item.id, submit, t, toast]);

  const whoseLine = held
    ? t('kavach.heldDesc')
    : item.verification === 'DEALER_EVIDENCE_THEN_ADMIN'
      ? t('kavach.withMdgAsk')
      : t('kavach.withMdg');

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-sm',
        submit.isError ? 'border-danger/40' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            status.tile,
          )}
          aria-hidden
        >
          <Icon width={20} strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-[15px] font-semibold leading-snug text-text">
              {label}
            </p>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                status.pill,
              )}
            >
              {t(status.labelKey)}
            </span>
          </div>

          {held ? (
            <p className="mt-1 text-sm font-medium text-text-muted">
              {t('kavach.heldTitle')}
            </p>
          ) : null}
          {notes ? (
            <p className="mt-1 text-xs text-text-muted">{notes}</p>
          ) : null}
          <p className="mt-1 text-xs text-text-subtle">{whoseLine}</p>
        </div>
      </div>

      {held ? null : (
        <div className="mt-3">
          {submit.isError ? (
            <button
              type="button"
              onClick={claim}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-danger-soft px-4 text-sm font-medium text-danger"
            >
              <RotateCw width={15} strokeWidth={2} />
              {t('kavach.tapRetry')}
            </button>
          ) : (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={claim}
              loading={submit.isPending}
              leftIcon={
                submit.isPending ? undefined : (
                  <Hand width={16} strokeWidth={1.75} />
                )
              }
            >
              {t('kavach.claimDone')}
            </Button>
          )}
          <p className="mt-1.5 px-1 text-center text-[11px] text-text-subtle">
            {t('kavach.claimHint')}
          </p>
        </div>
      )}
    </div>
  );
}
