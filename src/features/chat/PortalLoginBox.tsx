import { Check, ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, KeyRound, Lock, Truck } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

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
  nativeHas,
  openPortalAssist,
  openPortalPage,
  type NativePortalAssistResult,
} from '@/lib/nativeBridge';
import {
  PORTAL_NAMES,
  TANKER_PORTAL,
  XTRAPOWER_PORTAL,
  canResetPortalPassword,
  guidedResetUrl,
  isCompanyPortal,
  type PortalId,
  type PortalLoginState,
  type PortalTankerView,
  type SdmsResetView,
} from '@dk/shared/types';

import {
  portalResetErrorKey,
  portalResetLineKey,
  portalSavedDate,
  portalSaveErrorKey,
} from './portalLoginView';
import { SdmsResetFlow } from './SdmsResetFlow';
import { WemmisLoginBox } from './WemmisLoginBox';

/** What the user ID field says under it, for a portal whose ID has a name of its own. */
const USER_ID_HINT: Partial<Record<PortalId, MessageKey>> = {
  partners: 'chat.partnersUserIdHint',
  sdmsOld: 'chat.sdmsOldUserIdHint',
};

/** What "Forgot password?" says when it has no user ID to work with. */
const NEEDS_ID_KEY: Partial<Record<PortalId, MessageKey>> = {
  partners: 'chat.portalResetNeedsId',
  sdmsOld: 'chat.sdmsOldNeedsId',
};

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
  onForgot,
  hasSavedId = false,
  lead,
}: {
  portal: PortalId;
  onSaved: () => void;
  /** Present when the form was reopened over a saved login: a way back out. */
  onCancel?: () => void;
  /**
   * "Forgot password?" (IndianOil Partners', the old SDMS's), with the user ID typed above
   * (empty: the one the server has). The owner never types the ID twice.
   */
  onForgot?: (typedUserId: string) => void;
  /** A user ID is on record, so "Forgot password?" works with the field left empty. */
  hasSavedId?: boolean;
  /** One line above the fields: what to type here (after a guided reset, the new password). */
  lead?: MessageKey;
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
      {lead ? <p className="text-[13px] font-medium leading-snug text-wa-bubble-text">{t(lead)}</p> : null}
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
      {onForgot ? (
        <button
          type="button"
          onClick={() => {
            const typed = username.trim();
            if (!typed && !hasSavedId) {
              setErrorKey(NEEDS_ID_KEY[portal] ?? 'chat.portalResetNeedsId');
              return;
            }
            setErrorKey(null);
            onForgot(typed);
          }}
          className="flex min-h-11 items-center gap-1.5 self-start rounded-md px-1 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          <KeyRound width={15} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('chat.portalForgot')}
        </button>
      ) : null}
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
  otpReset = null,
  startOpen = false,
}: {
  portal: PortalId;
  state: PortalLoginState | undefined;
  canEdit: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** SDMS and the old SDMS: this login's OTP "Forgot password?" reset going now, or just ended. */
  otpReset?: SdmsResetView | null;
  /** Chosen from "Which password?": opens straight on the form for the new password. */
  startOpen?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [changing, setChanging] = React.useState(startOpen);
  // IndianOil Partners "Forgot password?" asked: the user ID typed in the form above, if
  // any (an empty one means the saved ID).
  const [askingReset, setAskingReset] = React.useState<{ userId: string } | null>(null);
  // IOC XtraPower "Forgot password?": the steps, the way to XtraPower's page, and the form
  // for the new password, until the owner saves it or closes them.
  const [guiding, setGuiding] = React.useState(false);
  // The owner closed the "enter the new password" form a finished reset opened.
  const [resetDismissedAt, setResetDismissedAt] = React.useState<string | null>(null);
  // SDMS / old SDMS "Forgot password?": opened by this owner, or a reset already going
  // (another owner's, or this one's from before). Closing it shows the form again.
  const otpPortal = portal === 'sdms' || portal === 'sdmsOld' ? portal : null;
  const [forgot, setForgot] = React.useState(false);
  // The old SDMS: the user ID typed in the form when "Forgot password?" was tapped.
  const [forgotId, setForgotId] = React.useState('');
  const [closedResetId, setClosedResetId] = React.useState<string | null>(null);
  const reset = otpPortal && otpReset && otpReset.id !== closedResetId ? otpReset : null;
  const resetOpen = !!otpPortal && canEdit && (forgot || !!reset);
  const closeReset = React.useCallback(() => {
    setForgot(false);
    setForgotId('');
    setClosedResetId(otpReset?.id ?? null);
  }, [otpReset?.id]);
  const openOldReset = (typed: string) => {
    setChanging(false);
    setForgotId(typed);
    setForgot(true);
  };
  const resetDone = React.useCallback(() => {
    setForgot(false);
    setChanging(false);
  }, []);
  const name = PORTAL_NAMES[portal];
  // A box posted before the team marked this login "not needed" (the server says
  // so with `needed: false`) stops asking for it. A login already saved still
  // shows as saved, and can still be changed.
  const notNeeded = !!state && state.needed === false && state.status !== 'saved';
  // IndianOil Partners' own reset (SDMS has its `reset` above).
  const pReset = state?.reset;
  const resetLine = portalResetLineKey(pReset);
  // IndianOil has sent a new password: the form opens for it, until the owner closes it.
  const awaitingNew = pReset?.state === 'sent' && resetDismissedAt !== pReset.at;
  const resetRunning = pReset?.state === 'running';
  const formOpen =
    !!state &&
    !notNeeded &&
    canEdit &&
    !resetRunning &&
    !askingReset &&
    !guiding &&
    (state.status !== 'saved' || changing || awaitingNew);
  const guideUrl = guidedResetUrl(portal);
  const canForget =
    !!state && !notNeeded && canEdit && canResetPortalPassword(portal) && !resetRunning && !askingReset;
  // A portal whose reset the owner does on its own page, with the steps here.
  const canGuide = !!state && !notNeeded && canEdit && !!guideUrl && !guiding;
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
            pReset?.state === 'failed' ? 'bg-wa-notice' : 'bg-black/[0.05]',
          )}
        >
          <p className="flex items-start gap-1.5">
            {resetRunning ? <Spinner size={14} /> : null}
            <span className="min-w-0 break-words">{t(resetLine)}</span>
          </p>
          {pReset?.portalWords && !resetRunning ? (
            <p className="mt-0.5 break-words text-[12px] text-wa-meta">
              {t('chat.portalResetSaid', { words: pReset.portalWords })}
            </p>
          ) : null}
        </div>
      ) : null}

      {askingReset && state ? (
        <ResetConfirm portal={portal} userId={askingReset.userId} onDone={() => setAskingReset(null)} />
      ) : null}

      {guiding && guideUrl && state && canEdit ? (
        // A phone app that can fills XtraPower's steps in; anywhere else, the steps to follow.
        nativeHas('portal-assist') ? (
          <XtraPowerAssist
            url={guideUrl}
            onSaved={() => {
              setGuiding(false);
              setChanging(false);
            }}
            onCancel={() => setGuiding(false)}
          />
        ) : (
          <>
            <PortalResetGuide url={guideUrl} />
            <PortalForm
              portal={portal}
              lead="chat.xtrapowerGuideBack"
              onSaved={() => {
                setGuiding(false);
                setChanging(false);
              }}
              onCancel={() => setGuiding(false)}
            />
          </>
        )
      ) : null}

      {state && state.status === 'saved' && !formOpen && !askingReset && !guiding ? (
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

      {resetOpen && otpPortal ? (
        <SdmsResetFlow
          portal={otpPortal}
          username={forgotId}
          initial={reset}
          onClose={closeReset}
          onDone={resetDone}
          onEditId={
            otpPortal === 'sdmsOld'
              ? () => {
                  closeReset();
                  setChanging(true);
                }
              : undefined
          }
        />
      ) : formOpen ? (
        <>
          <PortalForm
            portal={portal}
            onSaved={() => setChanging(false)}
            onCancel={
              state.status === 'saved'
                ? () => {
                    setChanging(false);
                    if (pReset) setResetDismissedAt(pReset.at);
                  }
                : undefined
            }
            onForgot={
              canForget
                ? (typed) => setAskingReset({ userId: typed })
                : canGuide
                  ? () => {
                      setChanging(false);
                      setGuiding(true);
                    }
                  : portal === 'sdmsOld'
                    ? openOldReset
                    : undefined
            }
            // The guided reset types the user ID on the portal's own page, not here; the old
            // SDMS's uses the one the server has when none is typed.
            hasSavedId={
              state.status === 'saved' || canGuide || (portal === 'sdmsOld' && !!state.resetPossible)
            }
          />
          {portal === 'sdms' && state.resetPossible ? (
            <button
              type="button"
              data-no-swipe
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setForgot(true)}
              className="mt-1 flex min-h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
            >
              {t('chat.sdmsForgot')}
            </button>
          ) : null}
        </>
      ) : null}

      {portal === 'sdmsOld' && canEdit && !formOpen && !resetOpen && state?.status === 'saved' ? (
        <button
          type="button"
          data-no-swipe
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openOldReset('')}
          className="mt-1 flex min-h-11 items-center gap-1.5 rounded-md px-1 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          <KeyRound width={15} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('chat.portalForgot')}
        </button>
      ) : null}

      {(canForget || canGuide) && !formOpen && state?.status === 'saved' ? (
        <button
          type="button"
          data-no-swipe
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setChanging(false);
            if (canGuide) setGuiding(true);
            else setAskingReset({ userId: '' });
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

/** The guided reset's steps, in order (`PortalResetGuide`). */
const GUIDE_STEPS: readonly MessageKey[] = [
  'chat.xtrapowerStep1',
  'chat.xtrapowerStep2',
  'chat.xtrapowerStep3',
  'chat.xtrapowerStep4',
];

/**
 * IOC XtraPower's "Forgot password?": the owner resets it on XtraPower's own page, because
 * its last step is Google's "I'm not a robot" tick and nothing may tick that for them. The
 * steps say what the page will ask; "Open XtraPower" opens the page (in the phone app, in
 * its own screen with the same steps on top); the form under this takes the new password.
 */
function PortalResetGuide({ url }: { url: string }) {
  const t = useT();
  const steps = GUIDE_STEPS.map((k) => t(k));
  return (
    <div
      data-no-swipe
      data-reset-guide
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-2 flex flex-col gap-2"
    >
      <p className="text-[13px] leading-snug text-wa-bubble-text">{t('chat.xtrapowerGuideIntro')}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-snug text-wa-bubble-text">
        {steps.map((step) => (
          <li key={step} className="break-words">
            {step}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => openPortalPage({ url, title: t('chat.xtrapowerPortalTitle'), steps })}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90"
      >
        <ExternalLink width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        {t('chat.xtrapowerGuideOpen')}
      </button>
    </div>
  );
}

/** XtraPower's own password rule, from its page: the app checks it before anything opens. */
const XTRAPOWER_PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*_])[A-Za-z][A-Za-z0-9@#$%&*_]{7,}$/;
/** A mobile number XtraPower's page accepts. */
const XTRAPOWER_MOBILE = /^[6-9]\d{9}$/;

/**
 * The 10-digit number in what was typed or pasted: "+91 98765 43210" and "098765 43210"
 * are 9876543210, never their first ten digits.
 */
function tenDigitMobile(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/**
 * IOC XtraPower's "Forgot password?" in a phone app that can fill it in (`openPortalAssist`):
 * the owner types the User ID, the registered mobile, PAN/TAN if XtraPower asks, and the
 * new password, once. The app opens XtraPower's page and does its screens; the SMS code is
 * typed into the app's panel; Google's "I'm not a robot" tick and the Continue under it are
 * the owner's own. When XtraPower confirms, the new password is saved here.
 *
 * What is typed stays in this component and goes only to the phone app (to type into
 * XtraPower's page) and, once XtraPower took it, to the outlet's record.
 */
function XtraPowerAssist({ url, onSaved, onCancel }: { url: string; onSaved: () => void; onCancel: () => void }) {
  const t = useT();
  const save = useSavePortalLogin();
  const ids = React.useId();
  const [userId, setUserId] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [pan, setPan] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<MessageKey | null>(null);
  // form → open (XtraPower on screen) → saved; or closed (shut before XtraPower confirmed).
  const [phase, setPhase] = React.useState<'form' | 'open' | 'closed'>('form');
  const requestId = React.useRef('');

  const keep = React.useCallback(async () => {
    setErrorKey(null);
    try {
      await save.mutateAsync({ portal: XTRAPOWER_PORTAL, username: userId.trim(), password });
      setPassword('');
      onSaved();
    } catch (err) {
      setErrorKey(portalSaveErrorKey(err));
      setPhase('closed');
    } finally {
      save.reset();
    }
  }, [save, userId, password, onSaved]);

  React.useEffect(() => {
    const onResult = (e: CustomEvent<NativePortalAssistResult>) => {
      if (!e.detail || e.detail.id !== requestId.current) return;
      requestId.current = '';
      if (e.detail.result === 'done') void keep();
      else setPhase('closed');
    };
    window.addEventListener('native-portal-assist', onResult);
    return () => window.removeEventListener('native-portal-assist', onResult);
  }, [keep]);

  const start = () => {
    const panClean = pan.trim().toUpperCase();
    if (!userId.trim()) return setErrorKey('chat.xtrapowerNeedsId');
    if (!XTRAPOWER_MOBILE.test(mobile.trim())) return setErrorKey('chat.xtrapowerBadMobile');
    if (panClean && !/^[A-Z0-9]{10}$/.test(panClean)) return setErrorKey('chat.xtrapowerBadPan');
    if (!XTRAPOWER_PASSWORD_RULE.test(password)) return setErrorKey('chat.xtrapowerBadPassword');
    setErrorKey(null);
    requestId.current = `xp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const opened = openPortalAssist({
      id: requestId.current,
      url,
      title: t('chat.xtrapowerPortalTitle'),
      fill: { userId: userId.trim(), mobile: mobile.trim(), pan: panClean, password },
      texts: {
        working: t('chat.xpaWorking'),
        otp: t('chat.xpaOtp'),
        otpPlaceholder: t('chat.xpaOtpPlaceholder'),
        otpButton: t('chat.xpaOtpButton'),
        pan: t('chat.xpaPan'),
        captcha: t('chat.xpaCaptcha'),
        tapverify: t('chat.xpaTapVerify'),
        error: t('chat.xpaError'),
        stuck: t('chat.xpaStuck'),
        done: t('chat.xpaDone'),
        close: t('chat.xpaClose'),
      },
    });
    if (opened) setPhase('open');
  };

  const field = (id: string, label: MessageKey, input: React.ReactNode) => (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
        {t(label)}
      </label>
      {input}
    </div>
  );
  const busy = save.isPending;

  return (
    <div
      data-no-swipe
      data-reset-assist={phase}
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-2 flex flex-col gap-2"
    >
      {phase === 'form' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
          autoComplete="off"
          noValidate
          className="flex flex-col gap-2"
        >
          <p className="text-[13px] leading-snug text-wa-bubble-text">{t('chat.xtrapowerAssistIntro')}</p>
          {field(
            `${ids}-id`,
            'chat.portalUserId',
            <input
              id={`${ids}-id`}
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={100}
              className={INPUT_CLASS}
            />,
          )}
          {field(
            `${ids}-mobile`,
            'chat.xtrapowerMobile',
            <input
              id={`${ids}-mobile`}
              type="tel"
              inputMode="numeric"
              value={mobile}
              onChange={(e) => setMobile(tenDigitMobile(e.target.value))}
              autoComplete="off"
              maxLength={10}
              className={INPUT_CLASS}
            />,
          )}
          {field(
            `${ids}-pan`,
            'chat.xtrapowerPan',
            <input
              id={`${ids}-pan`}
              type="text"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              className={INPUT_CLASS}
            />,
          )}
          {field(
            `${ids}-pass`,
            'chat.xtrapowerNewPassword',
            <div className="relative">
              <input
                id={`${ids}-pass`}
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={100}
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
            </div>,
          )}
          <p className="text-[12px] leading-snug text-wa-meta">{t('chat.xtrapowerRule')}</p>
          {errorKey ? (
            <p role="alert" className="rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text">
              {t(errorKey)}
            </p>
          ) : null}
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90"
          >
            <ExternalLink width={16} strokeWidth={2} className="shrink-0" aria-hidden />
            {t('chat.xtrapowerStart')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
          >
            {t('common.cancel')}
          </button>
        </form>
      ) : phase === 'open' ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="flex items-start gap-1.5 text-[13px] leading-snug text-wa-bubble-text">
            {busy ? <Spinner size={14} /> : null}
            <span className="min-w-0 break-words">{busy ? t('chat.xpaDone') : t('chat.xtrapowerOpenNow')}</span>
          </p>
          {!busy ? (
            <button
              type="button"
              onClick={start}
              className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
            >
              {t('chat.xtrapowerOpenAgain')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium leading-snug text-wa-bubble-text">{t('chat.xtrapowerClosedAsk')}</p>
          {errorKey ? (
            <p role="alert" className="rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text">
              {t(errorKey)}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void keep()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60"
          >
            {busy ? <Spinner size={16} /> : <Lock width={16} strokeWidth={2} className="shrink-0" aria-hidden />}
            {t('chat.xtrapowerYesSave')}
          </button>
          <button
            type="button"
            onClick={() => {
              setErrorKey(null);
              setPhase('form');
            }}
            className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
          >
            {t('chat.xtrapowerTryAgain')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Forgot password?", asked: what will happen, and the button that starts it. The user ID
 * is never asked for here: it is the saved one, or the one just typed in the form above
 * (`userId`). MDG fills the portal's own reset page; the portal sends the new password to
 * the owner's registered mobile or email.
 */
function ResetConfirm({ portal, userId, onDone }: { portal: PortalId; userId: string; onDone: () => void }) {
  const t = useT();
  const reset = useResetPortalPassword();
  const [errorKey, setErrorKey] = React.useState<MessageKey | null>(null);
  const busy = reset.isPending;

  const go = async () => {
    if (busy) return;
    setErrorKey(null);
    try {
      await reset.mutateAsync({ portal, ...(userId ? { username: userId } : {}) });
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
        disabled={busy}
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

type PickerChoice = PortalId | 'wemmis' | 'app';

/** The app's own password: changed in Settings, not here. */
function AppPasswordChoice() {
  const t = useT();
  return (
    <div data-app-password className="rounded-md bg-wa-row-active px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
        <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
        {t('chat.pickerApp')}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-wa-bubble-text">{t('chat.pickerAppHow')}</p>
      <Link
        to="/settings/account"
        className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90"
      >
        {t('chat.pickerAppOpen')}
      </Link>
    </div>
  );
}

/**
 * "Which password?" — every login the outlet has, then eMaaptaul when it has one, then
 * the app's own password. A tap opens that one login's form, ready for the new password,
 * with "Forgot password?" where the portal has one; "All passwords" goes back to the list.
 */
function PasswordPicker({
  portals,
  states,
  withWemmis,
  loading,
  renderRow,
}: {
  portals: readonly PortalId[];
  states: readonly PortalLoginState[];
  withWemmis: boolean;
  loading: boolean;
  renderRow: (portal: PortalId) => React.ReactNode;
}) {
  const t = useT();
  const [chosen, setChosen] = React.useState<PickerChoice | null>(null);

  if (chosen) {
    return (
      <div data-password-picker data-chosen={chosen} className="mt-1 flex flex-col gap-1.5">
        <button
          type="button"
          data-no-swipe
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setChosen(null)}
          className="flex min-h-11 items-center gap-1 self-start rounded-md px-1 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          <ChevronLeft width={16} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('chat.pickerBack')}
        </button>
        {chosen === 'app' ? <AppPasswordChoice /> : chosen === 'wemmis' ? <WemmisLoginBox /> : renderRow(chosen)}
      </div>
    );
  }

  const choices: Array<{ id: PickerChoice; label: string; note: MessageKey | null }> = [
    ...portals.map((p) => {
      const s = states.find((x) => x.portal === p);
      return {
        id: p as PickerChoice,
        label: isCompanyPortal(p) ? PORTAL_NAMES[p] : t('chat.portalTitle', { portal: PORTAL_NAMES[p] }),
        note: (s?.status === 'refused'
          ? 'chat.portalRefused'
          : s?.status === 'saved'
            ? 'chat.portalSaved'
            : s
              ? 'chat.portalNeeded'
              : null) as MessageKey | null,
      };
    }),
    ...(withWemmis ? [{ id: 'wemmis' as const, label: t('chat.wemmisTitle'), note: null }] : []),
    { id: 'app' as const, label: t('chat.pickerApp'), note: null },
  ];

  return (
    <div
      data-password-picker
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1 flex flex-col gap-1.5"
    >
      {choices.map((c) => (
        <button
          key={c.id}
          type="button"
          data-choice={c.id}
          onClick={() => setChosen(c.id)}
          className="flex min-h-11 w-full items-center gap-2 rounded-md bg-wa-row-active px-2.5 py-2 text-left active:bg-black/10"
        >
          <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[14px] font-medium leading-snug">{c.label}</span>
            {c.note ? (
              <span
                className={cn(
                  'block text-[12px] leading-snug',
                  c.note === 'chat.portalRefused' ? 'font-medium text-wa-bubble-text' : 'text-wa-meta',
                )}
              >
                {t(c.note)}
              </span>
            ) : loading && c.id !== 'app' && c.id !== 'wemmis' ? (
              <Spinner size={12} />
            ) : null}
          </span>
          <ChevronRight width={16} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
        </button>
      ))}
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
export function PortalLoginBox({
  portals,
  pick = false,
  withWemmis = false,
}: {
  portals: readonly PortalId[];
  /** "Which password?" (`MessagePortalLogin.pick`): a list to choose from first. */
  pick?: boolean;
  withWemmis?: boolean;
}) {
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
  // A box MDG posted to ask the tanker question by itself carries IndianOil Partners alone.
  const tankerBox = !companyPump && portals.includes(TANKER_PORTAL);
  const ioclBox = !companyPump && (tankerBox || shown.some((p) => p === 'sdms' || p === 'iras'));
  const tanker = ioclBox && view?.tanker?.asked ? view.tanker : null;
  const partners = view?.portals.find((p) => p.portal === TANKER_PORTAL);
  // The row only once there is something in it: after a yes, a saved login, or a reset.
  const showPartners =
    ioclBox && !!partners && (partners.needed || partners.status === 'saved' || !!partners.reset);
  const row = (portal: PortalId, startOpen = false) => (
    <PortalRow
      key={portal}
      startOpen={startOpen}
      portal={portal}
      state={view?.portals.find((p) => p.portal === portal)}
      canEdit={view?.canEdit ?? false}
      loading={q.isPending}
      failed={failed}
      onRetry={retry}
      otpReset={
        portal === 'sdms' ? (view?.sdmsReset ?? null) : portal === 'sdmsOld' ? (view?.sdmsOldReset ?? null) : null
      }
    />
  );
  if (pick) {
    return (
      <PasswordPicker
        // A login the outlet no longer has is not offered, whatever the message listed.
        portals={portals.filter((p) => !view || view.portals.some((s) => s.portal === p))}
        states={view?.portals ?? []}
        withWemmis={withWemmis}
        loading={q.isPending}
        renderRow={(p) => row(p, true)}
      />
    );
  }
  if (shown.length === 0 && !showPartners && !tanker) return null;
  return (
    <div data-portal-login className="mt-1 flex flex-col gap-1.5">
      {shown.map((p) => row(p))}
      {tanker ? <TankerQuestion tanker={tanker} canEdit={view?.canEdit ?? false} /> : null}
      {showPartners ? row(TANKER_PORTAL) : null}
    </div>
  );
}
