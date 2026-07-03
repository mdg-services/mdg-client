import * as React from 'react';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import { useLangStore, type Lang } from '@/store/lang';

const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'hi', label: 'हिंदी' },
  { value: 'en', label: 'English' },
];

/**
 * A segmented हिंदी / English switcher. Tapping flips the language instantly
 * across every screen (reactive store read), reflects it into the cached user,
 * and best-effort syncs it to the account via PATCH /v1/me — a failure never
 * blocks the UI (ADR 0008). Rounded-full pills, ≥44px tap targets.
 *
 * `compact` tightens padding/text for the app-shell header; `fill` stretches
 * the control to its container (e.g. the Profile settings row).
 */
export function LanguageToggle({
  compact = false,
  fill = false,
  className,
}: {
  compact?: boolean;
  fill?: boolean;
  className?: string;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const choose = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    // Reflect immediately in the cached user so a /me refetch doesn't flicker.
    if (user) setUser({ ...user, lang: next });
    // Best-effort: follow the member across devices. Ignore all failures.
    void api.patch('/v1/me', { lang: next }).catch(() => undefined);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('profile.language')}
      className={cn(
        'inline-flex items-center rounded-full bg-surface-2 p-0.5',
        fill && 'w-full',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === lang;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(opt.value)}
            className={cn(
              'flex min-h-[44px] items-center justify-center rounded-full font-medium transition-colors',
              compact ? 'px-3 text-xs' : 'px-4 text-sm',
              fill && 'flex-1',
              active
                ? 'bg-brand text-text-inverse shadow-sm'
                : 'text-text-muted hover:text-text',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
