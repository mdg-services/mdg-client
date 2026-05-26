import { Paperclip, SendHorizonal } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

import { StagedAttachmentChip, type StagedFile } from './AttachmentPreview';

export interface ComposerProps {
  onSend: (text: string, files: File[]) => Promise<void> | void;
  onTyping?: () => void;
  disabled?: boolean;
  sending?: boolean;
  initialText?: string;
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';

export function Composer({
  onSend,
  onTyping,
  disabled,
  sending,
  initialText,
}: ComposerProps) {
  const [text, setText] = React.useState(initialText ?? '');
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialText !== undefined) setText(initialText);
  }, [initialText]);

  // auto-resize
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  React.useEffect(() => {
    return () => {
      staged.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend = (text.trim().length > 0 || staged.length > 0) && !disabled;

  const handlePickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: StagedFile[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (!f) continue;
      const previewUrl = f.type.startsWith('image/')
        ? URL.createObjectURL(f)
        : undefined;
      next.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        previewUrl,
      });
    }
    setStaged((curr) => [...curr, ...next].slice(0, 10));
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeStaged = (id: string) => {
    setStaged((curr) => {
      const removed = curr.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
  };

  const doSend = async () => {
    if (!canSend) return;
    const body = text.trim();
    const files = staged.map((s) => s.file);
    staged.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setText('');
    setStaged([]);
    await onSend(body, files);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void doSend();
    }
  };

  return (
    <div className="border-t border-border bg-surface safe-bottom">
      {staged.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3 scrollbar-thin">
          {staged.map((s) => (
            <StagedAttachmentChip
              key={s.id}
              staged={s}
              onRemove={() => removeStaged(s.id)}
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2 px-3 py-3">
        <button
          type="button"
          aria-label="Attach file"
          onClick={() => fileRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
          disabled={disabled}
        >
          <Paperclip width={20} strokeWidth={1.75} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handlePickFiles(e.target.files)}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Message"
          className={cn(
            'min-h-[40px] max-h-[140px] flex-1 resize-none rounded-2xl border border-border bg-surface-2 px-4 py-2.5',
            'text-[15px] text-text placeholder:text-text-subtle',
            'focus:outline-none focus:ring-2 focus:ring-focus-ring',
          )}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label="Send"
          onClick={() => void doSend()}
          disabled={!canSend || sending}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            canSend
              ? 'bg-brand text-text-inverse hover:bg-brand-hover'
              : 'bg-surface-2 text-text-subtle',
            'disabled:cursor-not-allowed',
          )}
        >
          {sending ? <Spinner size={16} /> : <SendHorizonal width={18} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}
