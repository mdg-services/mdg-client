import { Check, Eye, EyeOff, Lock } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { usePortalLogins, useSavePortalLogin } from '@/hooks/api/usePortalLogins';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { PORTAL_NAMES, type PortalId, type PortalLoginState } from '@dk/shared/types';

import { portalSavedDate, portalSaveErrorKey } from './portalLoginView';

const INPUT_CLASS =
  'h-11 w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] text-wa-bubble-text placeholder:text-wa-meta focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/**
 * The form for ONE login: user ID, password, Save.
 *
 * What is typed goes to the outlet's record over its own route and nowhere else.
 * It is never a chat message, never put into the composer, never logged, and the
 * password leaves this component's state the moment the save has gone through.
 * A password the portal had already refused is cleared too, so the owner types
 * the new one instead of resending the old.
 */
function PortalForm({
  portal,
  onSaved,
  onCancel,
}: {
  portal: PortalId;
  onSaved: () => void;
  /** Present when the form was reopened over a saved login: a way back out. */
  onCancel?: () => void;
}) {
  const t = useT();
  const save = useSavePortalLogin();
  const ids = React.useId();
  const userId = `${ids}-user`;
  const passId = `${ids}-pass`;
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<MessageKey | null>(null);
  const scrollTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    },
    [],
  );

  const busy = save.isPending;
  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorKey(null);
    try {
      await save.mutateAsync({ portal, username: username.trim(), password });
      // In: drop what was typed, and the mutation's own copy of it.
      setPassword('');
      setUsername('');
      setShow(false);
      onSaved();
    } catch (err) {
      const key = portalSaveErrorKey(err);
      setErrorKey(key);
      // The refused password is no use again; any other failure keeps what was
      // typed so a retry on a bad link is one tap.
      if (key === 'chat.portalSameAsRefused') setPassword('');
    } finally {
      save.reset();
    }
  };

  // The keyboard rises over the lower half of a phone: once it has, bring the
  // field to the middle so what is being typed is visible.
  const bringIntoView = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      scrollTimer.current = null;
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 300);
  };

  return (
    <form
      // Holding a finger on a field (to paste, to select) must not select the
      // message or start a reply swipe: neither gesture may see a touch here.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => void submit(e)}
      autoComplete="off"
      noValidate
      className="mt-2 flex flex-col gap-2"
    >
      <div>
        <label htmlFor={userId} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
          {t('chat.portalUserId')}
        </label>
        <input
          id={userId}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onFocus={bringIntoView}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          enterKeyHint="next"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor={passId} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
          {t('chat.portalPassword')}
        </label>
        <div className="relative">
          <input
            id={passId}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={bringIntoView}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={500}
            enterKeyHint="done"
            className={cn(INPUT_CLASS, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('chat.portalHidePassword') : t('chat.portalShowPassword')}
            aria-pressed={show}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-wa-meta active:bg-black/10"
          >
            {show ? (
              <EyeOff width={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <Eye width={18} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {errorKey ? (
        <p
          role="alert"
          className="rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text"
        >
          {t(errorKey)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        aria-busy={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60"
      >
        {busy ? (
          <Spinner size={16} />
        ) : (
          <Lock width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.portalSave')}
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          {t('common.cancel')}
        </button>
      ) : null}
      <p className="text-[12px] leading-snug text-wa-meta">{t('chat.portalKeptSafe')}</p>
    </form>
  );
}

/** What the header chip says about one login. */
function StatusChip({ status }: { status: PortalLoginState['status'] }) {
  const t = useT();
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-bubble-text">
        <Check width={13} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
        {t('chat.portalSaved')}
      </span>
    );
  }
  if (status === 'refused') {
    return (
      <span className="rounded-full bg-wa-notice px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-bubble-text">
        {t('chat.portalRefused')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-black/[0.08] px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-meta">
      {t('chat.portalNeeded')}
    </span>
  );
}

/** One portal's block: its name and where it stands, then the form or what became of it. */
function PortalRow({
  portal,
  state,
  canEdit,
  loading,
  failed,
  onRetry,
}: {
  portal: PortalId;
  state: PortalLoginState | undefined;
  canEdit: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [changing, setChanging] = React.useState(false);
  const name = PORTAL_NAMES[portal];
  const formOpen = !!state && canEdit && (state.status !== 'saved' || changing);
  const savedDate = state?.savedAt ? portalSavedDate(state.savedAt, lang) : '';

  return (
    <div
      data-portal={portal}
      data-status={state?.status ?? (failed ? 'failed' : 'loading')}
      className="rounded-md bg-wa-row-active px-2.5 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
          <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
          {t('chat.portalTitle', { portal: name })}
        </p>
        {/* Read out when it changes: a save that goes through turns "Needed" into
            "Saved", and that is the answer to the button the owner just pressed. */}
        <span aria-live="polite">
          {state ? <StatusChip status={state.status} /> : loading ? <Spinner size={14} /> : null}
        </span>
      </div>

      {failed ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[13px] leading-snug text-wa-meta">{t('chat.askStateFailed')}</span>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 shrink-0 rounded-md px-2 text-[13px] font-medium text-wa-accent-strong active:bg-black/10"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {state && !canEdit && state.status !== 'saved' ? (
        <p className="mt-1 text-[13px] leading-snug text-wa-meta">{t('chat.portalOwnerFills')}</p>
      ) : null}

      {state && state.status === 'saved' && !formOpen ? (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="min-w-0 break-words text-[13px] leading-snug text-wa-meta">
            {savedDate ? t('chat.portalSavedOn', { date: savedDate }) : t('chat.portalSaved')}
          </span>
          {canEdit ? (
            <button
              type="button"
              data-no-swipe
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setChanging(true)}
              className="min-h-11 shrink-0 rounded-md px-2 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
            >
              {t('chat.portalChange')}
            </button>
          ) : null}
        </div>
      ) : null}

      {formOpen ? (
        <PortalForm
          portal={portal}
          onSaved={() => setChanging(false)}
          onCancel={state.status === 'saved' ? () => setChanging(false) : undefined}
        />
      ) : null}
    </div>
  );
}

/**
 * The login box inside an MDG message (`message.portalLogin`): one block per
 * portal asked for, each showing the live state of that login. It is the only
 * thing in the chat that asks the query for the view, so a chat with no box in
 * it never makes the call.
 */
export function PortalLoginBox({ portals }: { portals: readonly PortalId[] }) {
  const q = usePortalLogins();
  const view = q.data;
  const failed = q.isError && !view;
  const { refetch } = q;
  const retry = React.useCallback(() => void refetch(), [refetch]);
  return (
    <div data-portal-login className="mt-1 flex flex-col gap-1.5">
      {portals.map((portal) => (
        <PortalRow
          key={portal}
          portal={portal}
          state={view?.portals.find((p) => p.portal === portal)}
          canEdit={view?.canEdit ?? false}
          loading={q.isPending}
          failed={failed}
          onRetry={retry}
        />
      ))}
    </div>
  );
}
