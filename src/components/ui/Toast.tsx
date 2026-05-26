import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

type Intent = 'success' | 'danger' | 'info';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  intent: Intent;
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id' | 'intent'> & { intent?: Intent }) => string;
  success: (msg: string, opts?: Partial<Toast>) => string;
  error: (msg: string, opts?: Partial<Toast>) => string;
  info: (msg: string, opts?: Partial<Toast>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const INTENT_CLASSES: Record<Intent, string> = {
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (partial: Omit<Toast, 'id'>): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration =
        partial.duration ?? (partial.intent === 'danger' ? 0 : 3500);
      const next: Toast = { ...partial, id, duration };
      setToasts((curr) => [...curr, next]);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const ctx: ToastContextValue = React.useMemo(
    () => ({
      toast: (t) => push({ intent: t.intent ?? 'info', ...t }),
      success: (msg, opts) =>
        push({ intent: 'success', title: msg, ...opts }),
      error: (msg, opts) => push({ intent: 'danger', title: msg, ...opts }),
      info: (msg, opts) => push({ intent: 'info', title: msg, ...opts }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex w-full max-w-sm flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-md animate-in"
          >
            <span
              className={cn(
                'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full',
                INTENT_CLASSES[t.intent],
              )}
            >
              {t.intent === 'success' ? (
                <CheckCircle2 width={14} height={14} strokeWidth={1.75} />
              ) : t.intent === 'danger' ? (
                <AlertCircle width={14} height={14} strokeWidth={1.75} />
              ) : (
                <Info width={14} height={14} strokeWidth={1.75} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {t.title ? (
                <p className="text-sm font-medium text-text">{t.title}</p>
              ) : null}
              {t.description ? (
                <p className="mt-0.5 text-xs text-text-muted">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="rounded-full p-1 text-text-muted hover:bg-surface-2"
            >
              <X width={14} height={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
