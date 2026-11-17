import { Copy, Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Spinner, useToast } from '@/components/ui';
import { showLogin } from '@/hooks/api/useLogins';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';

import type { LoginPortal } from './types';

/** How long a shown password stays on the screen before it is hidden again. */
export const SHOW_FOR_MS = 30_000;

const DOTS = '••••••••';

/**
 * A password the owner can look at: dots to begin with, and the real one after "Show".
 *
 * The password is fetched at the tap (`versionId` for an old entry) and held only in this
 * component's state: not in the query cache, not in a draft, not anywhere that outlives
 * the row. It goes back to dots after half a minute and when the row leaves the screen.
 * The dots are always the same length, so they do not hint at the real one.
 */
export function PasswordValue({
  portal,
  name,
  versionId,
}: {
  portal: LoginPortal;
  /** The login's name, for the buttons' spoken labels. */
  name: string;
  /** An old entry's id; absent for the login as it is now. */
  versionId?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [shown, setShown] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  const stopTimer = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  React.useEffect(() => stopTimer, [stopTimer]);

  const hide = () => {
    stopTimer();
    setShown(null);
  };

  const show = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const got = await showLogin(portal, versionId);
      setShown(got.password);
      stopTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setShown(null);
      }, SHOW_FOR_MS);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (shown === null) return;
    if (await copyText(shown)) toast.success(t('logins.copied'));
    else toast.error(t('logins.copyFailed'));
  };

  const isShown = shown !== null;
  return (
    <div>
      <div className="flex items-center gap-1">
        <span
          data-testid="password-value"
          className="min-w-0 flex-1 select-text break-all font-mono text-[15px] text-text"
        >
          {isShown ? shown : DOTS}
        </span>
        {isShown ? (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={t('logins.copyPasswordFor', { name })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
          >
            <Copy width={18} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={isShown ? hide : () => void show()}
          disabled={busy}
          aria-label={isShown ? t('logins.hideFor', { name }) : t('logins.showFor', { name })}
          aria-pressed={isShown}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-brand active:bg-surface-2 disabled:opacity-60"
        >
          {busy ? (
            <Spinner size={16} />
          ) : isShown ? (
            <EyeOff width={18} strokeWidth={1.75} aria-hidden />
          ) : (
            <Eye width={18} strokeWidth={1.75} aria-hidden />
          )}
          <span aria-hidden>{isShown ? t('logins.hide') : t('logins.show')}</span>
        </button>
      </div>
      {failed ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {t('logins.showFailed')}
        </p>
      ) : null}
    </div>
  );
}
