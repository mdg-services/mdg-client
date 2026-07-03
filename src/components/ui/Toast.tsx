import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

type Intent = 'success' | 'danger' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  intent: Intent;
  duration?: number;
  /** Optional affordance (e.g. "Message us") rendered as a button in the toast. */
  action?: ToastAction;
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
  const t = useT();
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
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-md animate-in"
          >
            <span
              className={cn(
                'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full',
                INTENT_CLASSES[item.intent],
              )}
            >
              {item.intent === 'success' ? (
                <CheckCircle2 width={14} height={14} strokeWidth={1.75} />
              ) : item.intent === 'danger' ? (
                <AlertCircle width={14} height={14} strokeWidth={1.75} />
              ) : (
                <Info width={14} height={14} strokeWidth={1.75} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {item.title ? (
                <p className="text-sm font-medium text-text">{item.title}</p>
              ) : null}
              {item.description ? (
                <p className="mt-0.5 text-xs text-text-muted">
                  {item.description}
                </p>
              ) : null}
              {item.action ? (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="mt-1.5 text-xs font-semibold text-brand underline-offset-2 hover:underline"
                >
                  {item.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={t('common.dismiss')}
              onClick={() => dismiss(item.id)}
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
