import { Users } from 'lucide-react';

import { BrandMark } from '@/components/BrandMark';
import { cn } from '@/lib/cn';
import type { ConversationKind } from '@dk/shared/types';

/**
 * The round picture of a chat: the MDG mark on a light tint for the support
 * chat, a group glyph for the manager chat — the two kinds of thread a dealer has.
 * Used in the open chat's bar and on the chat info screen.
 */
export function ChatAvatar({
  kind,
  size = 40,
  className,
}: {
  kind: ConversationKind | undefined;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-wa-row-active text-wa-accent-strong',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {kind === 'manager' ? (
        <Users width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} strokeWidth={1.75} />
      ) : (
        <BrandMark size={Math.round(size * 0.62)} />
      )}
    </span>
  );
}
