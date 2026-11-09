import { Check, Eye, EyeOff, KeyRound, Lock, Truck } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import {
  usePortalLogins,
  useResetPortalPassword,
  useSavePortalLogin,
  useSaveTankerAnswer,
} from '@/hooks/api/usePortalLogins';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import {
  PORTAL_NAMES,
  TANKER_PORTAL,
  canResetPortalPassword,
  isCompanyPortal,
  type PortalId,
  type PortalLoginState,
  type PortalTankerView,
} from '@dk/shared/types';

import {
  portalResetErrorKey,
  portalResetLineKey,
  portalSavedDate,
  portalSaveErrorKey,
} from './portalLoginView';

/** What the user ID field says under it, for a portal whose ID has a name of its own. */
const USER_ID_HINT: Partial<Record<PortalId, MessageKey>> = { partners: 'chat.partnersUserIdHint' };

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
        {USER_ID_HINT[portal] ? (
          <p className="mt-0.5 text-[12px] leading-snug text-wa-meta">{t(USER_ID_HINT[portal]!)}</p>
        ) : null}
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
function StatusChip({
  status,
  notNeeded = false,
}: {
  status: PortalLoginState['status'];
  /** The team marked this login "not needed" and none is saved: nothing to ask. */
  notNeeded?: boolean;
}) {
  const t = useT();
  if (notNeeded) {
    return (
      <span className="rounded-full bg-black/[0.08] px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-meta">
        {t('chat.portalNotNeeded')}
      </span>
    );
  }
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
  const [askingReset, setAskingReset] = React.useState(false);
  // The owner closed the "enter the new password" form a finished reset opened.
  const [resetDismissedAt, setResetDismissedAt] = React.useState<string | null>(null);
  const name = PORTAL_NAMES[portal];
  // A box posted before the team marked this login "not needed" (the server says
  // so with `needed: false`) stops asking for it. A login already saved still
  // shows as saved, and can still be changed.
  const notNeeded = !!state && state.needed === false && state.status !== 'saved';
  const reset = state?.reset;
  const resetLine = portalResetLineKey(reset);
  // IndianOil has sent a new password: the form opens for it, until the owner closes it.
  const awaitingNew = reset?.state === 'sent' && resetDismissedAt !== reset.at;
  const resetRunning = reset?.state === 'running';
  const formOpen =
    !!state &&
    !notNeeded &&
    canEdit &&
    !resetRunning &&
    !askingReset &&
    (state.status !== 'saved' || changing || awaitingNew);
  const canForget =
    !!state && !notNeeded && canEdit && canResetPortalPassword(portal) && !resetRunning && !askingReset;
  const savedDate = state?.savedAt ? portalSavedDate(state.savedAt, lang) : '';

  return (
    <div
      data-portal={portal}
      data-status={state?.status ?? (failed ? 'failed' : 'loading')}
      data-not-needed={notNeeded ? '' : undefined}
      className="rounded-md bg-wa-row-active px-2.5 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
          <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
          {/* A company portal is named by its company alone ("BPCL portal"): never by
              what MDG does on it. SDMS and IRAS keep "{name} login". */}
          {isCompanyPortal(portal) ? name : t('chat.portalTitle', { portal: name })}
        </p>
        {/* Read out when it changes: a save that goes through turns "Needed" into
            "Saved", and that is the answer to the button the owner just pressed. */}
        <span aria-live="polite">
          {state ? (
            <StatusChip status={state.status} notNeeded={notNeeded} />
          ) : loading ? (
            <Spinner size={14} />
          ) : null}
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

      {state && !canEdit && !notNeeded && state.status !== 'saved' ? (
        <p className="mt-1 text-[13px] leading-snug text-wa-meta">{t('chat.portalOwnerFills')}</p>
      ) : null}

      {resetLine ? (
        <div
          role="status"
          className={cn(
            'mt-1 rounded-md px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text',
            reset?.state === 'failed' ? 'bg-wa-notice' : 'bg-black/[0.05]',
          )}
        >
          <p className="flex items-start gap-1.5">
            {resetRunning ? <Spinner size={14} /> : null}
            <span className="min-w-0 break-words">{t(resetLine)}</span>
          </p>
          {reset?.portalWords && !resetRunning ? (
            <p className="mt-0.5 break-words text-[12px] text-wa-meta">
              {t('chat.portalResetSaid', { words: reset.portalWords })}
            </p>
          ) : null}
        </div>
      ) : null}

      {askingReset && state ? (
        <ResetConfirm
          portal={portal}
          needsUserId={state.status === 'missing'}
          onDone={() => setAskingReset(false)}
        />
      ) : null}

      {state && state.status === 'saved' && !formOpen && !askingReset ? (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="min-w-0 text-[13px] leading-snug text-wa-meta">
            <span className="break-words">
              {savedDate ? t('chat.portalSavedOn', { date: savedDate }) : t('chat.portalSaved')}
            </span>
            {/* Only where the view says the team typed it (round 3). */}
            {state.savedBy === 'mdg' ? (
              <span className="block break-words">{t('setup.filledByMdg')}</span>
            ) : null}
          </div>
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
          onCancel={
            state.status === 'saved'
              ? () => {
                  setChanging(false);
                  if (reset) setResetDismissedAt(reset.at);
                }
              : undefined
          }
        />
      ) : null}

      {canForget ? (
        <button
          type="button"
          data-no-swipe
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setChanging(false);
            setAskingReset(true);
          }}
          className="mt-1 flex min-h-11 items-center gap-1.5 rounded-md px-1 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          <KeyRound width={15} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('chat.portalForgot')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Forgot password?", asked: what will happen, the user ID when none is saved, and the
 * button that starts it. MDG fills the portal's own reset page; the portal sends the new
 * password to the owner's registered mobile or email.
 */
function ResetConfirm({
  portal,
  needsUserId,
  onDone,
}: {
  portal: PortalId;
  /** No login is saved: the portal's reset page needs the user ID, so the owner types it. */
  needsUserId: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const reset = useResetPortalPassword();
  const id = React.useId();
  const [username, setUsername] = React.useState('');
  const [errorKey, setErrorKey] = React.useState<MessageKey | null>(null);
  const busy = reset.isPending;
  const canGo = !busy && (!needsUserId || username.trim().length > 0);

  const go = async () => {
    if (!canGo) return;
    setErrorKey(null);
    try {
      await reset.mutateAsync({ portal, ...(needsUserId ? { username: username.trim() } : {}) });
      onDone();
    } catch (err) {
      setErrorKey(portalResetErrorKey(err));
    }
  };

  return (
    <div
      data-no-swipe
      data-reset-confirm
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-2 flex flex-col gap-2"
    >
      <p className="text-[13px] leading-snug text-wa-bubble-text">{t('chat.portalResetExplain')}</p>
      {needsUserId ? (
        <div>
          <label htmlFor={`${id}-user`} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
            {t('chat.portalUserId')}
          </label>
          <input
            id={`${id}-user`}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={200}
            className={INPUT_CLASS}
          />
          {USER_ID_HINT[portal] ? (
            <p className="mt-0.5 text-[12px] leading-snug text-wa-meta">{t(USER_ID_HINT[portal]!)}</p>
          ) : null}
        </div>
      ) : null}
      {errorKey ? (
        <p
          role="alert"
          className="rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text"
        >
          {t(errorKey)}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void go()}
        disabled={!canGo}
        aria-busy={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60"
      >
        {busy ? <Spinner size={16} /> : <KeyRound width={16} strokeWidth={2} className="shrink-0" aria-hidden />}
        {t('chat.portalResetGo')}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}

/**
 * "Do you also own a tanker?" — inside an Indian Oil pump's box. The owner answers Yes
 * or No; a yes adds the IndianOil Partners row under it (the server then lists that
 * login). Answered, it shows the answer in one line with Change. A manager reads it.
 */
function TankerQuestion({ tanker, canEdit }: { tanker: PortalTankerView; canEdit: boolean }) {
  const t = useT();
  const save = useSaveTankerAnswer();
  const [changing, setChanging] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const open = tanker.owns === null || changing;

  const answer = async (owns: boolean) => {
    setFailed(false);
    try {
      await save.mutateAsync(owns);
      setChanging(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div data-tanker-question className="rounded-md bg-wa-row-active px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
          <Truck width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
          {open ? t('chat.tankerQuestion') : t(tanker.owns ? 'chat.tankerOwns' : 'chat.tankerNone')}
        </p>
        {!open && canEdit ? (
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
      {open ? (
        canEdit ? (
          <>
            <p className="mt-0.5 text-[13px] leading-snug text-wa-meta">{t('chat.tankerWhy')}</p>
            <div
              data-no-swipe
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-2 grid grid-cols-2 gap-2"
            >
              {([true, false] as const).map((owns) => (
                <button
                  key={String(owns)}
                  type="button"
                  disabled={save.isPending}
                  aria-pressed={tanker.owns === owns}
                  onClick={() => void answer(owns)}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-lg px-3 text-[15px] font-medium active:opacity-90 disabled:opacity-60',
                    tanker.owns === owns
                      ? 'bg-wa-accent text-white'
                      : 'border border-wa-divider bg-wa-in text-wa-bubble-text',
                  )}
                >
                  {t(owns ? 'chat.tankerYes' : 'chat.tankerNo')}
                </button>
              ))}
            </div>
            {failed ? (
              <p role="alert" className="mt-1 text-[13px] leading-snug text-wa-bubble-text">
                {t('chat.tankerSaveFailed')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-0.5 text-[13px] leading-snug text-wa-meta">{t('chat.tankerOwnerAnswers')}</p>
        )
      ) : null}
    </div>
  );
}

/**
 * The login box inside an MDG message (`message.portalLogin`): one block per
 * portal asked for, in the order the message lists them (SDMS and IRAS for an
 * Indian Oil outlet, the one company portal for BPCL or HPCL), each showing the
 * live state of that login. Nothing in a block is about what a portal is used
 * for, so the same block serves them all. It is the only
 * thing in the chat that asks the query for the view, so a chat with no box in
 * it never makes the call.
 */
export function PortalLoginBox({ portals }: { portals: readonly PortalId[] }) {
  const q = usePortalLogins();
  const view = q.data;
  const failed = q.isError && !view;
  const { refetch } = q;
  const retry = React.useCallback(() => void refetch(), [refetch]);
  // An outlet that needs a BPCL or HPCL login is a BPCL or HPCL pump: a box posted
  // while it was still down as Indian Oil (the company changed afterwards) no longer
  // shows its SDMS and IRAS rows, so such an owner never sees those portals.
  const companyPump = !!view?.portals.some((p) => isCompanyPortal(p.portal) && p.needed);
  const shown = (companyPump ? portals.filter(isCompanyPortal) : portals).filter((p) => p !== TANKER_PORTAL);
  // An Indian Oil box (SDMS or IRAS in it) also carries the tanker question, and — once
  // the owner says yes, or a login is saved — the IndianOil Partners row under it. A box
  // posted before the question existed grows both by itself: they follow the server.
  const ioclBox = !companyPump && shown.some((p) => p === 'sdms' || p === 'iras');
  const tanker = ioclBox && view?.tanker?.asked ? view.tanker : null;
  const partners = view?.portals.find((p) => p.portal === TANKER_PORTAL);
  const showPartners =
    !companyPump &&
    (portals.includes(TANKER_PORTAL) ||
      (ioclBox && !!partners && (partners.needed || partners.status === 'saved' || !!partners.reset)));
  if (shown.length === 0 && !showPartners) return null;
  const row = (portal: PortalId) => (
    <PortalRow
      key={portal}
      portal={portal}
      state={view?.portals.find((p) => p.portal === portal)}
      canEdit={view?.canEdit ?? false}
      loading={q.isPending}
      failed={failed}
      onRetry={retry}
    />
  );
  return (
    <div data-portal-login className="mt-1 flex flex-col gap-1.5">
      {shown.map(row)}
      {tanker ? <TankerQuestion tanker={tanker} canEdit={view?.canEdit ?? false} /> : null}
      {showPartners ? row(TANKER_PORTAL) : null}
    </div>
  );
}
