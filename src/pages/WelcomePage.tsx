import { ChevronRight, Construction, Fuel, Globe } from 'lucide-react';
import * as React from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { BrandMark } from '@/components/BrandMark';
import { LANGUAGE_NAMES, LanguageSheet } from '@/components/LanguageSheet';
import { plannerSignUpEnabled } from '@/features/planner/enabled';
import { useLang, useT } from '@/lib/i18n';

/**
 * The first screen on a phone nobody has signed in on (ADR 0058 §3.1;
 * `features/auth/firstScreen.ts`): one question, two big answers.
 *
 *   "I run a petrol pump"           → /register (the outlet sign-up, unchanged)
 *   "I want to open a petrol pump"  → /register/new-pump (New Pump Guide)
 *
 * The language button sits at the top, because this is the first thing a new
 * person reads. `?for=new-pump` (a link from the website or a campaign) skips the
 * question and goes straight to the New Pump Guide form. Any other query (a film
 * link's `?r=` share code) goes along to whichever form is chosen.
 */
export function WelcomePage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const [languageOpen, setLanguageOpen] = React.useState(false);

  // The query string without `for`, carried on to the form.
  const carried = React.useMemo(() => {
    const next = new URLSearchParams(search);
    next.delete('for');
    const s = next.toString();
    return s ? `?${s}` : '';
  }, [search]);

  // New Pump Guide's sign-up switched off: there is only one road.
  if (!plannerSignUpEnabled()) return <Navigate to={`/register${carried}`} replace />;
  if (params.get('for') === 'new-pump') return <Navigate to={`/register/new-pump${carried}`} replace />;

  return (
    <div className="min-h-full bg-bg px-4 pb-12 pt-4">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <div className="flex items-center justify-between gap-2">
          <BrandMark size={40} className="text-text" />
          <button
            type="button"
            onClick={() => setLanguageOpen(true)}
            aria-label={t('profile.language')}
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-3 text-meta font-medium text-text active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Globe width={18} strokeWidth={1.75} aria-hidden />
            {LANGUAGE_NAMES[lang]}
          </button>
        </div>

        <h1 className="mt-8 text-title text-text">{t('welcome.title')}</h1>
        <p className="mt-2 text-body text-text-muted">{t('welcome.lead')}</p>

        <ul className="mt-6 flex flex-col gap-3">
          <li>
            <ChoiceCard
              icon={<Fuel width={28} strokeWidth={1.75} />}
              label={t('welcome.runPump')}
              onClick={() => navigate(`/register${carried}`)}
            />
          </li>
          <li>
            <ChoiceCard
              icon={<Construction width={28} strokeWidth={1.75} />}
              label={t('welcome.openPump')}
              onClick={() => navigate(`/register/new-pump${carried}`)}
            />
          </li>
        </ul>

        <p className="mt-8 text-center text-meta text-text-muted">
          {t('welcome.haveAccount')}{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="min-h-12 rounded-lg px-1 font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {t('auth.signIn')}
          </button>
        </p>
      </div>

      {languageOpen ? <LanguageSheet onClose={() => setLanguageOpen(false)} /> : null}
    </div>
  );
}

/** One answer: the whole card is the button, an icon and one line, big enough to hit with a thumb. */
function ChoiceCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] w-full items-center gap-4 rounded-2xl border border-border-strong bg-surface px-4 py-4 text-left shadow-sm transition-colors active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-heading leading-snug text-text">{label}</span>
      <ChevronRight className="size-6 shrink-0 text-text-subtle rtl:rotate-180" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
