import { useNavigate } from 'react-router-dom';

import { InsightRow } from '@/components/kit/InsightRow';
import { SectionCard } from '@/components/kit/SectionCard';
import { useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import type { TodayTask } from '@dk/shared/types';

export interface NeedsItem {
  task: TodayTask;
  /** The service's name, written on the row where the list mixes services (the door). */
  serviceName?: string;
  waitingDays: number;
}

/**
 * "Needs you" on the Services door and on a service page: the open tasks of the feed, each as one row
 * with a clock and a word, what it is, how long it has waited, and one 44px button that opens the
 * chat at the box. (Today answers a photo ask inside its row; here the box in the chat does, so a
 * row never says "Sent" about something it did not send.)
 */
export function NeedsYouList({ items }: { items: readonly NeedsItem[] }) {
  const t = useT();
  const tn = useTn();
  const navigate = useNavigate();
  if (items.length === 0) return null;
  const open = (task: TodayTask) =>
    navigate(`/chat/${encodeURIComponent(task.conversationId)}`, {
      state: { jumpToMessageId: task.messageId },
    });
  return (
    <SectionCard title={t('glance.section.needs')} count={items.length} variant="tinted">
      <ul className="divide-y divide-border">
        {items.map(({ task, serviceName, waitingDays }) => {
          const age =
            waitingDays <= 0 ? t('svc.needs.today') : tn('svc.needs.waiting', waitingDays);
          return (
            <li key={task.id}>
              <InsightRow
                status="waiting"
                text={task.title}
                meta={serviceName ? `${serviceName}, ${age}` : age}
                action={{
                  label: t('svc.needs.open'),
                  onPress: () => open(task),
                  variant: 'primary',
                }}
              />
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
