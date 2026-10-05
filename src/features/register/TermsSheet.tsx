import { Check, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';

import { TERMS_EN, TERMS_HI } from './terms';

/**
 * The Terms & Conditions, read inside the app.
 *
 * The website opens these in a pop-up beside its form; this is the same thing
 * as a bottom sheet, so a dealer never leaves the app to read what they are
 * agreeing to. "I agree & continue" ticks the box on the form behind it.
 *
 * On the Hindi screen the clauses are a courtesy translation, so the sheet says
 * the English text is the binding one and offers it, exactly as the website does.
 */
export function TermsSheet({
  onClose,
  onAgree,
}: {
  onClose: () => void;
  onAgree: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const panelRef = useDialog(onClose);
  const titleId = React.useId();
  const courtesy = lang === 'hi';
  const [original, setOriginal] = React.useState(false);
  const showEnglish = !courtesy || original;
  const clauses = showEnglish ? TERMS_EN : TERMS_HI;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        aria-label={t('register.close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-lg outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-text-muted">{t('register.termsEyebrow')}</p>
            <h2 id={titleId} className="mt-0.5 text-lg font-semibold text-text">
              {t('register.termsTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('register.close')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-muted active:bg-surface-2"
          >
            <X width={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {courtesy ? (
            <div className="mb-4 rounded-xl bg-surface-2 p-3">
              <p className="text-[13px] leading-relaxed text-text-muted">
                {t('register.bindingNotice')}
              </p>
              <button
                type="button"
                onClick={() => setOriginal((v) => !v)}
                aria-pressed={original}
                className="mt-1 min-h-[44px] text-sm font-semibold text-brand underline underline-offset-4"
              >
                {original ? t('register.showHindi') : t('register.showEnglish')}
              </button>
            </div>
          ) : null}

          <ol lang={showEnglish ? 'en' : 'hi'}>
            {clauses.map((clause, i) => (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] gap-x-3 border-t border-border py-3 first:border-t-0 first:pt-0"
              >
                <span className="text-sm font-bold tabular-nums text-text-subtle">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed text-text">{clause}</p>
              </li>
            ))}
          </ol>

          <p className="mt-4 rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-text-muted">
            {t('register.annexure')}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
            {t('register.close')}
          </Button>
          <Button
            size="lg"
            fullWidth
            onClick={onAgree}
            rightIcon={<Check width={18} strokeWidth={2.2} />}
          >
            {t('register.agreeContinue')}
          </Button>
        </div>
      </div>
    </div>
  );
}
