import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import * as React from 'react';
import { useInRouterContext, useMatch } from 'react-router-dom';

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
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (partial: Omit<Toast, 'id'>): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // An error toast used to live FOREVER (`0`), on the theory that a failure
      // deserves to be read. What it actually did was park a card over the
      // bottom of the screen — over the composer with the keyboard up — that
      // swallowed taps until somebody hit a 22px ✕. A dealer who missed that ✕
      // had a dead strip across the bottom of their app.
      // Eight seconds is long enough to read a sentence twice; a caller that
      // genuinely needs a sticky toast still passes `duration: 0` explicitly
      // (the "Saving…" toast does).
      const duration =
        partial.duration ?? (partial.intent === 'danger' ? 8000 : 3500);
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
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/**
 * Where the toasts sit: just above the bottom edge of the screen, clear of the
 * phone's own gesture area (`env(safe-area-inset-bottom)`). There is no tab bar
 * to clear any more.
 *
 * ONE SCREEN IS DIFFERENT. In an open conversation the composer is pinned to
 * the bottom edge, and a toast there would sit on top of the message the dealer
 * is typing and swallow the taps meant for it — so on `/chat/:id` the toasts
 * stay above the composer.
 *
 * Asking the router which screen this is has to survive being rendered with no
 * router at all (several tests mount the provider that way), and a hook cannot
 * be called conditionally — so the router-aware half is its own component, only
 * rendered when there is a router to ask.
 */
function ToastViewport(props: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const inRouter = useInRouterContext();
  return inRouter ? <RoutedToastViewport {...props} /> : <ToastList {...props} raised={false} />;
}

function RoutedToastViewport(props: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const inConversation = !!useMatch('/chat/:id');
  return <ToastList {...props} raised={inConversation} />;
}

function ToastList({
  toasts,
  dismiss,
  raised,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
  /** True while a composer is pinned to the bottom edge. */
  raised: boolean;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-50 mx-auto flex w-full max-w-sm flex-col gap-2 px-4',
        raised
          ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]',
      )}
    >
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
              <p className="mt-0.5 text-xs text-text-muted">{item.description}</p>
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
            // A 44px target inside the card's own padding: the negative
            // margin absorbs the extra size, so the card keeps its shape.
            className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
          >
            <X width={16} height={16} strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </div>
  );
}
