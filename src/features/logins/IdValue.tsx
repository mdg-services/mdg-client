import { Copy } from 'lucide-react';

import { useToast } from '@/components/ui';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';

/** A login's ID: the text, easy to select, and a button that copies it. */
export function IdValue({ value, name }: { value: string; name: string }) {
  const t = useT();
  const toast = useToast();
  const copy = async () => {
    if (await copyText(value)) toast.success(t('logins.copied'));
    else toast.error(t('logins.copyFailed'));
  };
  return (
    <div className="flex items-center gap-1">
      <span data-testid="id-value" className="min-w-0 flex-1 select-text break-all font-mono text-body text-text">
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('logins.copyIdFor', { name })}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
      >
        <Copy width={18} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
