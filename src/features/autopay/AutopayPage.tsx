import { AlertCircle, CheckCircle2, ChevronRight, Lock, MessageCircle, Repeat } from 'lucide-react';
import * as React from 'react';

import { SubPage } from '@/components/SubPage';
import { Button, Card, CardContent } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import { StateBlock } from '@/features/payments/StateBlock';
import { useLang, useT } from '@/lib/i18n';
import { dealerCodeLabel, formatPaise } from '@dk/shared';
import type { DealerAutopay } from '@dk/shared/types';

import { useAutopayStatus, useIsOwner } from './api';
import { AutopayChip } from './AutopayChip';
import {
  autopayBody,
  canStop,
  offBody,
  showAskInChat,
  stopLabelKey,
} from './autopayView';
import { StopAutopayDialog } from './StopAutopayDialog';

/** One grey block the shape of the card, while the answer comes down the wire. */
function CardSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="h-44 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
    </div>
  );
}

/** A row that opens the member's own chat with MDG. */
function ChatRow({ title, description }: { title: string; description?: string }) {
  const openChat = useOpenMyChat();
  return (
    <Card>
      <button
        type="button"
        onClick={openChat}
        className="flex min-h-[64px] w-full items-center gap-4 rounded-2xl p-4 text-left active:bg-surface-2"
      >
        <MessageCircle
          width={24}
          height={24}
          strokeWidth={1.75}
          className="shrink-0 text-text-muted"
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-text">{title}</span>
          {description ? (
            <span className="block text-base text-text-muted">{description}</span>
          ) : null}
        </span>
        <ChevronRight width={20} height={20} className="shrink-0 text-text-subtle" aria-hidden />
      </button>
    </Card>
  );
}

/**
 * An autopay that exists: the card, the one button that stops it, and — once it
 * is off — the screen that says so.
 *
 * What is NOT here is the point. No button turns it on, no link goes anywhere,
 * and no sentence says how to start one: inside the Android app autopay is only
 * shown and stopped (payments/policy.ts). The Off screen therefore has nothing
 * to offer but the chat, for the owner who wants to end Dealer Kavach itself.
 */
function AutopayDetail({ autopay }: { autopay: DealerAutopay }) {
  const t = useT();
  const lang = useLang();
  const [confirming, setConfirming] = React.useState(false);
  const closeConfirm = React.useCallback(() => setConfirming(false), []);

  if (autopay.state === 'off') {
    return (
      <>
        <StateBlock
          icon={<CheckCircle2 width={28} strokeWidth={1.5} />}
          title={t('autopay.off.title')}
          description={offBody(t, lang, autopay)}
        />
        <ChatRow title={t('autopay.off.stopService')} />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-4xl font-bold tabular-nums text-text">
              {formatPaise(autopay.amountPaise)}
            </p>
            <AutopayChip state={autopay.state} />
          </div>
          <p className="text-base font-medium text-text-muted">
            {t('autopay.pump', { code: dealerCodeLabel(autopay.outletCode) })}
          </p>
          <p className="text-base text-text">{autopayBody(t, lang, autopay)}</p>
        </CardContent>
      </Card>

      {canStop(autopay.state) ? (
        <Button variant="secondary" size="lg" fullWidth onClick={() => setConfirming(true)}>
          {t(stopLabelKey(autopay.state))}
        </Button>
      ) : null}

      {showAskInChat(autopay.state) ? (
        <ChatRow title={t('help.askInChat')} description={t('help.askInChatDesc')} />
      ) : null}

      {confirming ? (
        <StopAutopayDialog autopay={autopay} onKeep={closeConfirm} onDone={closeConfirm} />
      ) : null}
    </>
  );
}

/**
 * Autopay — the monthly bill taken by itself, and the one thing the owner can do
 * about it from here: stop it (ADR 0022 §13). Reached at `/settings/autopay`,
 * from the Help screen and from the Payments page.
 *
 * Stopping autopay does not end the service: the paid month runs out, and the
 * next month's bill comes outside the app, as it did before autopay.
 *
 * It is the OWNER's. A manager sees only that, and no request is made on their
 * behalf (the server would answer 403). Every state has a way out in the bar.
 */
export function AutopayPage() {
  const t = useT();
  const isOwner = useIsOwner();
  const query = useAutopayStatus();

  // An error, OR a request paused because the phone is offline: `isLoading` alone
  // is false for both, and a skeleton waiting on a network that is not there
  // never ends.
  const failed =
    !query.data && (query.isError || (query.status === 'pending' && query.fetchStatus === 'paused'));
  const autopay = query.data?.autopay ?? null;

  let body;
  if (!isOwner) {
    body = (
      <StateBlock
        icon={<Lock width={28} strokeWidth={1.5} />}
        title={t('autopay.ownerOnlyTitle')}
      />
    );
  } else if (query.data) {
    body = autopay ? (
      <AutopayDetail autopay={autopay} />
    ) : (
      <StateBlock icon={<Repeat width={28} strokeWidth={1.5} />} title={t('autopay.noneTitle')} />
    );
  } else if (failed) {
    body = (
      <StateBlock
        icon={<AlertCircle width={28} strokeWidth={1.5} />}
        title={t('autopay.loadFailedTitle')}
        action={
          <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  } else {
    body = <CardSkeleton />;
  }

  return (
    <SubPage title={t('autopay.title')} className="gap-4 pb-10">
      {body}
    </SubPage>
  );
}
