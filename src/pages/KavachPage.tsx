import type { KavachItem } from '@dk/shared/types';
import { MessageCircle, PartyPopper, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState, Spinner, useToast } from '@/components/ui';
import { ComplianceTaskCard } from '@/features/kavach/ComplianceTaskCard';
import { PumpHealthRing } from '@/features/kavach/PumpHealthRing';
import { byUrgency, isDueToday, isSos } from '@/features/kavach/status';
import { useKavachMe } from '@/hooks/api/useKavach';
import { useMyConversation } from '@/hooks/api/useMyConversation';

function GroupHeader({ en, hi }: { en: string; hi: string }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
      {en} / {hi}
    </h2>
  );
}

function HelpFooter() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/chat')}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium text-brand shadow-sm active:bg-surface-2"
    >
      <MessageCircle width={16} strokeWidth={1.75} />
      Need help? Message us / मदद चाहिए? हमें लिखें
    </button>
  );
}

export function KavachPage() {
  const toast = useToast();
  const meQuery = useKavachMe();
  const conversationQuery = useMyConversation();

  const programme = meQuery.data?.programme;
  const items = meQuery.data?.items ?? [];

  const settling = React.useMemo(() => {
    if (!programme?.settlingUntil) return false;
    return Date.now() < new Date(programme.settlingUntil).getTime();
  }, [programme?.settlingUntil]);

  const today = React.useMemo(
    () => items.filter(isDueToday).sort(byUrgency),
    [items],
  );
  const sos = React.useMemo(() => items.filter(isSos), [items]);

  const onDone = React.useCallback(
    (_item: KavachItem) => {
      toast.success('Done! / हो गया!', {
        description: 'Your pump health went up. / आपकी पंप हेल्थ बढ़ गई।',
      });
    },
    [toast],
  );

  if (meQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  }

  if (meQuery.isError) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EmptyState
          icon={<ShieldCheck width={28} strokeWidth={1.5} />}
          title="We couldn't load this just now"
          description="Please check your network and try again. If it keeps happening, send us a message in Chat and we'll help."
        />
        <HelpFooter />
      </div>
    );
  }

  // No programme initiated yet — calm welcome, never a broken/empty table.
  if (!programme) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          Pump health / कवच
        </h1>
        <EmptyState
          icon={<ShieldCheck width={28} strokeWidth={1.5} />}
          title="Welcome to Kavach / कवच में स्वागत है"
          description="This is where you'll see what keeps your pump safe and compliant. We'll guide you, one small task at a time. / यहाँ आप देखेंगे कि आपके पंप को सुरक्षित रखने के लिए क्या ज़रूरी है। हम एक-एक करके बताएंगे।"
        />
        <HelpFooter />
      </div>
    );
  }

  const conversationId = conversationQuery.data?.id;
  const todoCount = today.length;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          Pump health
        </h1>
        <span className="text-base font-semibold text-text-muted">कवच</span>
      </div>

      {/* Headline: the ring, with the ACTION COUNT leading (number secondary). */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <PumpHealthRing pct={programme.score.overallPct} settling={settling} />
        {settling ? (
          <p className="text-center text-sm text-text-muted">
            Getting started — nothing to worry about yet.
            <br />
            अभी शुरू कर रहे हैं — अभी चिंता की कोई बात नहीं।
          </p>
        ) : todoCount > 0 ? (
          <p className="text-center text-sm font-medium text-text">
            {todoCount === 1
              ? '1 thing to do today / आज 1 काम बाकी है'
              : `${todoCount} things to do today / आज ${todoCount} काम बाकी हैं`}
          </p>
        ) : (
          <p className="text-center text-sm font-medium text-success">
            All done for today / आज सब हो गया
          </p>
        )}
      </div>

      {/* Today list */}
      {todoCount > 0 ? (
        <section className="flex flex-col gap-2">
          <GroupHeader en="Do today" hi="आज करें" />
          <div className="flex flex-col gap-2.5">
            {today.map((item) => (
              <ComplianceTaskCard
                key={item.id}
                item={item}
                conversationId={conversationId}
                onDone={onDone}
              />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<PartyPopper width={28} strokeWidth={1.5} />}
          title="All done for today! / आज सब हो गया!"
          description="Your pump is in great shape. We'll let you know when something needs you. / आपका पंप बढ़िया स्थिति में है। ज़रूरत होने पर हम आपको बताएंगे।"
        />
      )}

      {/* SOS — never a daily chore; one muted collapsed explainer. */}
      {sos.length > 0 ? (
        <details className="rounded-2xl border border-border bg-surface-2/50 px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none font-medium text-text-muted">
            When it happens / जब ज़रूरत हो ({sos.length})
          </summary>
          <p className="mt-2 text-xs text-text-muted">
            These happen only when needed — we handle them with you. / ये ज़रूरत
            पड़ने पर होते हैं — हम आपके साथ इन्हें संभालते हैं।
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {sos.map((item) => (
              <li key={item.id} className="text-xs text-text-subtle">
                {item.labelEn} / {item.labelHi}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <HelpFooter />
    </div>
  );
}
