import { Check } from 'lucide-react';
import * as React from 'react';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { GST_STATES } from '@dk/shared';
import type { OutletSetupView, SetupBilling } from '@dk/shared/types';

import { Alert, Block, CardBox, LinkButton, Note, SaveButton } from './CardParts';
import { checkGstin, stateLabel, stateOptions } from './cardView';
import { useSaveSetupBilling } from './useOutletSetup';

const FIELD_CLASS =
  'h-11 w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] text-wa-bubble-text placeholder:text-wa-meta focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60';

/** The shortest a name and an address may be: what the server accepts. */
const MIN_NAME = 2;
const MIN_ADDRESS = 5;

/**
 * The billing card: who the bill is made out to.
 *
 * The name starts from what MDG already has; the owner adds one line of address
 * and picks the state. A GST number is optional and never blocks anything: it is
 * checked as it is typed, the state is read from its first two digits (and the
 * state box locks to it, because that is what the tax follows), and "no GST
 * number" is one tap that clears it. It can be changed until the payment is in.
 */
export function BillingCard({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const save = useSaveSetupBilling();
  const ids = React.useId();
  const nameId = `${ids}-name`;
  const addressId = `${ids}-address`;
  const stateId = `${ids}-state`;
  const gstinId = `${ids}-gstin`;
  const saved = view.billing;
  const prefill = view.billingPrefill;
  const locked = view.payment.state === 'paid';
  const canChange = view.canEdit && !locked;

  const [name, setName] = React.useState(saved?.name ?? prefill.name ?? '');
  const [address, setAddress] = React.useState(saved?.address ?? '');
  const [stateCode, setStateCode] = React.useState(saved?.stateCode ?? prefill.stateCode ?? '');
  const [gstinText, setGstinText] = React.useState(saved?.gstin ?? prefill.gstin ?? '');
  const [noGst, setNoGst] = React.useState(!!saved && saved.gstin === null);
  const [editing, setEditing] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [lockedByServer, setLockedByServer] = React.useState(false);

  const gst = checkGstin(noGst ? '' : gstinText);
  // With a good GST number the state is not a choice: the number says which.
  const effectiveState = gst.state === 'ok' ? gst.stateCode : stateCode;
  const states = React.useMemo(() => stateOptions(lang), [lang]);

  const nameOk = name.trim().length >= MIN_NAME;
  const addressOk = address.trim().length >= MIN_ADDRESS;
  const stateOk = !!GST_STATES[effectiveState];
  const gstOk = gst.state === 'empty' || gst.state === 'ok';

  const showForm = canChange && (editing || !saved);

  if (!showForm) {
    if (!saved) {
      return (
        <CardBox kind="billing">
          <Note>{t('setup.ownerFills')}</Note>
        </CardBox>
      );
    }
    return (
      <CardBox kind="billing">
        <Block>
          <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
            <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
            {t('setup.billSaved')}
          </p>
          <SavedLines billing={saved} lang={lang} />
          {/* Only where the server says MDG's team saved them (round 3): a dealer who saved
              their own, and an outlet from before the field existed, see nothing. */}
          {view.billingSavedBy === 'mdg' ? (
            <Note className="mt-0.5">{t('setup.filledByMdg')}</Note>
          ) : null}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            {locked ? <Note>{t('setup.billLocked')}</Note> : <span />}
            {canChange ? (
              <LinkButton
                onClick={() => {
                  setLockedByServer(false);
                  save.reset();
                  setEditing(true);
                }}
              >
                {t('setup.change')}
              </LinkButton>
            ) : null}
          </div>
        </Block>
      </CardBox>
    );
  }

  const busy = save.isPending;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (!nameOk || !addressOk || !stateOk || !gstOk) return;
    setLockedByServer(false);
    try {
      await save.mutateAsync({
        name: name.trim(),
        address: address.trim(),
        stateCode: effectiveState,
        gstin: gst.state === 'ok' ? gst.gstin : null,
      });
      setEditing(false);
      setTried(false);
    } catch (err) {
      // 409: the payment was recorded while this was open, so it is closed now.
      if (err instanceof ApiError && err.status === 409) setLockedByServer(true);
    }
  };

  return (
    <CardBox kind="billing">
      <form onSubmit={(e) => void submit(e)} noValidate autoComplete="off" className="flex flex-col gap-2">
        <div>
          <label htmlFor={nameId} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
            {t('setup.billName')}
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            maxLength={160}
            enterKeyHint="next"
            aria-invalid={tried && !nameOk}
            className={FIELD_CLASS}
          />
          {tried && !nameOk ? <FieldError>{t('setup.billErrName')}</FieldError> : null}
        </div>

        <div>
          <label htmlFor={addressId} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
            {t('setup.billAddress')}
          </label>
          <input
            id={addressId}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="off"
            maxLength={300}
            enterKeyHint="next"
            aria-invalid={tried && !addressOk}
            className={FIELD_CLASS}
          />
          {tried && !addressOk ? <FieldError>{t('setup.billErrAddress')}</FieldError> : null}
        </div>

        <div>
          <label htmlFor={stateId} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
            {t('setup.billState')}
          </label>
          <select
            id={stateId}
            value={effectiveState}
            onChange={(e) => setStateCode(e.target.value)}
            // Locked to the GST number's own state while there is a good one.
            disabled={gst.state === 'ok'}
            aria-invalid={tried && !stateOk}
            className={FIELD_CLASS}
          >
            <option value="">{t('setup.billStatePick')}</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
          {gst.state === 'ok' ? <Note className="mt-0.5">{t('setup.gstinState')}</Note> : null}
          {tried && !stateOk ? <FieldError>{t('setup.billErrState')}</FieldError> : null}
        </div>

        <div>
          <label htmlFor={gstinId} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
            {t('setup.billGstin')}
          </label>
          <input
            id={gstinId}
            type="text"
            value={noGst ? '' : gstinText}
            onChange={(e) => setGstinText(e.target.value.toUpperCase())}
            disabled={noGst}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            enterKeyHint="done"
            aria-invalid={gst.state === 'bad' || (tried && !gstOk)}
            aria-describedby={`${gstinId}-hint`}
            className={cn(FIELD_CLASS, 'uppercase tracking-wide')}
          />
          <p
            id={`${gstinId}-hint`}
            className={cn(
              'mt-0.5 text-[13px] leading-snug',
              gst.state === 'ok'
                ? 'font-medium text-wa-bubble-text'
                : gst.state === 'bad' || (tried && !gstOk)
                  ? 'text-wa-bubble-text underline decoration-wa-meta underline-offset-2'
                  : 'text-wa-meta',
            )}
            aria-live="polite"
          >
            {gst.state === 'ok'
              ? t('setup.gstinOk')
              : gst.state === 'bad'
                ? t('setup.gstinBad')
                : gst.state === 'partial'
                  ? t('setup.gstinCount', { n: gst.length })
                  : t('setup.gstinHelp')}
          </p>
          <label className="mt-0.5 flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] leading-snug">
            <input
              type="checkbox"
              checked={noGst}
              onChange={(e) => {
                setNoGst(e.target.checked);
                if (e.target.checked) setGstinText('');
              }}
              className="h-5 w-5 shrink-0 accent-wa-accent"
            />
            {t('setup.billNoGst')}
          </label>
        </div>

        {lockedByServer ? (
          <Alert>{t('setup.billLocked')}</Alert>
        ) : save.isError ? (
          <Alert>{t('setup.saveFailed')}</Alert>
        ) : null}

        <SaveButton busy={busy}>{t('setup.billSave')}</SaveButton>
        {saved ? (
          <button
            type="button"
            onClick={() => {
              setName(saved.name);
              setAddress(saved.address);
              setStateCode(saved.stateCode);
              setGstinText(saved.gstin ?? '');
              setNoGst(saved.gstin === null);
              setTried(false);
              setEditing(false);
            }}
            className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
          >
            {t('common.cancel')}
          </button>
        ) : null}
      </form>
    </CardBox>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-0.5 text-[13px] leading-snug text-wa-bubble-text">
      <span className="rounded-sm bg-wa-notice px-1.5 py-0.5">{children}</span>
    </p>
  );
}

/** The saved details, as lines. */
function SavedLines({ billing, lang }: { billing: SetupBilling; lang: Lang }) {
  const t = useT();
  return (
    <dl className="mt-1 flex flex-col gap-0.5 text-[14px] leading-snug">
      <div>
        <dt className="sr-only">{t('setup.billName')}</dt>
        <dd className="break-words font-medium">{billing.name}</dd>
      </div>
      <div>
        <dt className="sr-only">{t('setup.billAddress')}</dt>
        <dd className="break-words">{billing.address}</dd>
      </div>
      <div>
        <dt className="sr-only">{t('setup.billState')}</dt>
        <dd>{stateLabel(billing.stateCode, lang)}</dd>
      </div>
      <div>
        <dt className="sr-only">{t('setup.billGstin')}</dt>
        <dd className="tracking-wide">{billing.gstin ?? t('setup.noGstGiven')}</dd>
      </div>
    </dl>
  );
}
