import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, Info, Reply, X } from 'lucide-react';
import * as React from 'react';

import { AppBarIconButton } from '@/components/AppBar';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/**
 * The two bars that take the open chat's place at the top of the screen:
 * the search field, and the contextual bar that appears while messages are
 * selected. Same white bar and same height as `AppBar` — they swap in and out
 * of one slot, they do not stack on it.
 */
function BarFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 shrink-0">
      <div className="border-b border-wa-divider bg-wa-bar">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-1 pl-1 pr-1 md:max-w-2xl lg:max-w-3xl">
          {children}
        </div>
      </div>
    </div>
  );
}

export interface ChatSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** ← : leave the search and put the chat's own bar back. */
  onClose: () => void;
  /** A short line next to the arrows: "3 / 12", "No results", or why there is no answer. */
  status: string | null;
  statusTone?: 'normal' | 'error';
  /** Offered when the search itself failed. */
  onRetry?: () => void;
  /** ↑ goes to the next OLDER hit, ↓ to the next newer one. */
  onOlder: () => void;
  onNewer: () => void;
  canOlder: boolean;
  canNewer: boolean;
}

/** The chat bar turned into a search field, with ↑ and ↓ to walk through the hits. */
export function ChatSearchBar({
  value,
  onChange,
  onClose,
  status,
  statusTone = 'normal',
  onRetry,
  onOlder,
  onNewer,
  canOlder,
  canNewer,
}: ChatSearchBarProps) {
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <BarFrame>
      <AppBarIconButton
        label={t('common.back')}
        onClick={onClose}
        icon={<ArrowLeft width={24} strokeWidth={2} />}
      />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter walks to the next hit, as it does in WhatsApp's own search.
          if (e.key === 'Enter') {
            e.preventDefault();
            if (canOlder) onOlder();
          }
        }}
        placeholder={t('chat.searchPlaceholder')}
        aria-label={t('chat.searchPlaceholder')}
        className="h-10 min-w-0 flex-1 bg-transparent px-1 text-[17px] text-wa-bar-text placeholder:text-wa-meta focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <AppBarIconButton
          label={t('chat.searchClear')}
          onClick={() => onChange('')}
          icon={<X width={20} strokeWidth={2} />}
        />
      ) : null}
      {status ? (
        onRetry && statusTone === 'error' ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-full px-2 py-1 text-[13px] text-danger active:bg-wa-row-active"
          >
            {status}
          </button>
        ) : (
          <span
            role="status"
            className={cn(
              'shrink-0 px-1 text-[13px] tabular-nums',
              statusTone === 'error' ? 'text-danger' : 'text-wa-meta',
            )}
          >
            {status}
          </span>
        )
      ) : null}
      <AppBarIconButton
        label={t('chat.searchOlder')}
        onClick={onOlder}
        disabled={!canOlder}
        icon={<ArrowUp width={22} strokeWidth={2} />}
      />
      <AppBarIconButton
        label={t('chat.searchNewer')}
        onClick={onNewer}
        disabled={!canNewer}
        icon={<ArrowDown width={22} strokeWidth={2} />}
      />
    </BarFrame>
  );
}

export interface ChatSelectionBarProps {
  count: number;
  onClear: () => void;
  /** Only when exactly one message is selected. */
  onReply?: () => void;
  /** Any selection that holds at least one message with words. */
  onCopy?: () => void;
  /** Exactly one selected message, and it carries a file. */
  onDownload?: () => void;
  /** Exactly one selected message, and it is the reader's own. */
  onInfo?: () => void;
}

/**
 * The bar while messages are selected: ✕, how many, then only the actions that
 * make sense for what is selected. Star, forward and delete are not here on
 * purpose — the thread is a business record, and nothing in it is the dealer's
 * to remove.
 */
export function ChatSelectionBar({
  count,
  onClear,
  onReply,
  onCopy,
  onDownload,
  onInfo,
}: ChatSelectionBarProps) {
  const t = useT();
  return (
    <BarFrame>
      <AppBarIconButton
        label={t('chat.clearSelection')}
        onClick={onClear}
        icon={<X width={24} strokeWidth={2} />}
      />
      <span
        className="min-w-0 flex-1 px-1 text-[20px] font-medium tabular-nums text-wa-bar-text"
        aria-live="polite"
      >
        {count}
      </span>
      {onReply ? (
        <AppBarIconButton
          label={t('chat.reply')}
          onClick={onReply}
          icon={<Reply width={22} strokeWidth={2} />}
        />
      ) : null}
      {onCopy ? (
        <AppBarIconButton
          label={t('chat.copy')}
          onClick={onCopy}
          icon={<Copy width={21} strokeWidth={2} />}
        />
      ) : null}
      {onDownload ? (
        <AppBarIconButton
          label={t('chat.download')}
          onClick={onDownload}
          icon={<Download width={22} strokeWidth={2} />}
        />
      ) : null}
      {onInfo ? (
        <AppBarIconButton
          label={t('chat.messageInfo')}
          onClick={onInfo}
          icon={<Info width={22} strokeWidth={2} />}
        />
      ) : null}
    </BarFrame>
  );
}
