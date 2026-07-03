import { Mic, Paperclip, SendHorizonal, Trash2 } from 'lucide-react';
import * as React from 'react';

import { StagedAttachmentChip, type StagedFile } from './AttachmentPreview';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  attachmentKindFor,
  formatDuration,
  type OutgoingAttachment,
} from '@/lib/uploadAttachment';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';


export interface ComposerProps {
  onSend: (text: string, attachments: OutgoingAttachment[]) => Promise<void> | void;
  onTyping?: () => void;
  disabled?: boolean;
  sending?: boolean;
  initialText?: string;
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';

function extForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export function Composer({
  onSend,
  onTyping,
  disabled,
  sending,
  initialText,
}: ComposerProps) {
  const t = useT();
  const [text, setText] = React.useState(initialText ?? '');
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder();
  const isRecording = recorder.status === 'recording';

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

  const hasContent = text.trim().length > 0 || staged.length > 0;
  const canSend = hasContent && !disabled;

  const handlePickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: StagedFile[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (!f) continue;
      const kind = attachmentKindFor(f.type);
      const previewUrl = kind === 'image' ? URL.createObjectURL(f) : undefined;
      next.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        kind,
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

  // Send the typed text plus any staged attachments (and optional extras that
  // haven't hit state yet, e.g. a just-finished recording).
  const doSend = async (extras: StagedFile[] = []) => {
    const items = [...staged, ...extras];
    const body = text.trim();
    if (body.length === 0 && items.length === 0) return;
    if (disabled) return;

    const outgoing: OutgoingAttachment[] = items.map((s) => ({
      file: s.file,
      kind: s.kind,
      durationMs: s.durationMs,
    }));
    staged.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setText('');
    setStaged([]);
    await onSend(body, outgoing);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void doSend();
    }
  };

  const startRecording = async () => {
    const ok = await recorder.start();
    if (!ok) {
      // getUserMedia denied/unsupported — fall back to the file picker so the
      // user can still attach an audio file from their device.
      fileRef.current?.click();
    }
  };

  // Stop, package the clip as a staged audio file, and send immediately.
  const stopAndSend = async () => {
    const rec = await recorder.stop();
    if (!rec || rec.blob.size === 0) return;
    // Normalise to a clean base audio MIME: strip any ";codecs=…" suffix and
    // guarantee an audio/* type, so the presign allowlist accepts it and the
    // S3 PUT Content-Type matches what was signed. Some Android WebViews report
    // an empty blob type, which would otherwise become application/octet-stream.
    let mime = ((rec.mimeType || rec.blob.type || 'audio/webm').split(';')[0] || 'audio/webm').trim();
    if (!mime.startsWith('audio/')) mime = 'audio/webm';
    const ext = extForMime(mime);
    const file = new File([rec.blob], `voice-${Date.now()}.${ext}`, {
      type: mime,
    });
    const item: StagedFile = {
      id: `voice-${Date.now()}`,
      file,
      kind: 'audio',
      durationMs: rec.durationMs,
    };
    await doSend([item]);
  };

  return (
    <div className="border-t border-border bg-surface safe-bottom">
      {staged.length > 0 && !isRecording ? (
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

      {isRecording ? (
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            type="button"
            aria-label={t('chat.cancelRecording')}
            onClick={() => recorder.cancel()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
          >
            <Trash2 width={20} strokeWidth={1.75} />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            <span className="text-sm font-medium tabular-nums text-text">
              {formatDuration(recorder.elapsedMs)}
            </span>
            <span className="text-sm text-text-subtle">
              {t('chat.recordingHint')}
            </span>
          </div>
          <button
            type="button"
            aria-label={t('chat.sendVoice')}
            onClick={() => void stopAndSend()}
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-text-inverse hover:bg-brand-hover disabled:cursor-not-allowed"
          >
            {sending ? <Spinner size={16} /> : <SendHorizonal width={18} strokeWidth={1.75} />}
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 py-3">
          <button
            type="button"
            aria-label={t('chat.addPhoto')}
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
            placeholder={t('chat.placeholder')}
            className={cn(
              'min-h-[40px] max-h-[140px] flex-1 resize-none rounded-2xl border border-border bg-surface-2 px-4 py-2.5',
              'text-[15px] text-text placeholder:text-text-subtle',
              'focus:outline-none focus:ring-2 focus:ring-focus-ring',
            )}
            disabled={disabled}
          />
          {canSend ? (
            <button
              type="button"
              aria-label={t('chat.send')}
              onClick={() => void doSend()}
              disabled={sending}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                'bg-brand text-text-inverse hover:bg-brand-hover',
                'disabled:cursor-not-allowed',
              )}
            >
              {sending ? <Spinner size={16} /> : <SendHorizonal width={18} strokeWidth={1.75} />}
            </button>
          ) : (
            <button
              type="button"
              aria-label={t('chat.recordVoice')}
              onClick={() => void startRecording()}
              disabled={disabled}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                'bg-brand text-text-inverse hover:bg-brand-hover',
                'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-subtle',
              )}
            >
              <Mic width={20} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
