import { Check } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { OIL_COMPANIES, OIL_COMPANY_NAMES, type OilCompanyId, type OutletSetupView } from '@dk/shared/types';

import { Alert, Block, CardBox, LinkButton, Note } from './CardParts';
import { companyChangeable, companyLabel } from './cardView';
import { useSaveSetupCompany } from './useOutletSetup';

/**
 * The company card: which oil company the pump is with.
 *
 * It is the first thing asked, because the company decides which portal logins come
 * later. Three large buttons, one tap each: a tap saves, there is no Save button to
 * forget. Once chosen it shows the choice with a tick and "Change", which reopens
 * the three, until the services start (after that the server refuses, and so does
 * the card). A manager sees the same read-only.
 */
export function CompanyCard({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const save = useSaveSetupCompany();
  const questionId = React.useId();
  const saved = view.company;
  const open = companyChangeable(view.stage);
  const canChange = view.canEdit && open;
  const [editing, setEditing] = React.useState(false);
  const [lockedByServer, setLockedByServer] = React.useState(false);

  const showChoices = canChange && (editing || !saved);

  if (!showChoices) {
    if (!saved) {
      // Past this step with no company on record cannot happen on the server's side;
      // an owner is shown nothing rather than a line that is not true.
      return view.canEdit ? null : (
        <CardBox kind="company">
          <Note>{t('setup.ownerFills')}</Note>
        </CardBox>
      );
    }
    return (
      <CardBox kind="company">
        <Block>
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
              <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
              {companyLabel(saved, lang)}
            </p>
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
          {view.companySavedBy === 'mdg' ? <Note>{t('setup.filledByMdg')}</Note> : null}
          {!open ? <Note>{t('setup.companyLocked')}</Note> : null}
        </Block>
      </CardBox>
    );
  }

  const busy = save.isPending;
  const picking = save.isPending ? save.variables.company : null;

  const pick = async (company: OilCompanyId) => {
    if (busy) return;
    // The company it already is: nothing to save, so just close the choice.
    if (company === saved) {
      save.reset();
      setEditing(false);
      return;
    }
    setLockedByServer(false);
    try {
      await save.mutateAsync({ company });
      setEditing(false);
    } catch (err) {
      // 409: the services started while this was open, so it is closed now.
      if (err instanceof ApiError && err.status === 409) setLockedByServer(true);
    }
  };

  return (
    <CardBox kind="company">
      <p id={questionId} className="text-[14px] font-medium leading-snug">
        {t('setup.companyQuestion')}
      </p>
      <div role="group" aria-labelledby={questionId} className="flex flex-col gap-1.5">
        {OIL_COMPANIES.map((company) => {
          const names = OIL_COMPANY_NAMES[company];
          const chosen = company === saved;
          return (
            <button
              key={company}
              type="button"
              data-company={company}
              aria-pressed={chosen}
              aria-busy={picking === company}
              disabled={busy}
              onClick={() => void pick(company)}
              className={cn(
                'flex min-h-14 w-full items-center justify-between gap-2 rounded-lg border-2 px-3 py-1.5 text-left text-wa-bubble-text active:bg-black/10 disabled:opacity-60',
                chosen ? 'border-wa-accent bg-wa-row-active' : 'border-wa-divider bg-wa-in',
              )}
            >
              <span className="min-w-0">
                <span className="block break-words text-[16px] font-medium leading-snug">
                  {names[lang]}
                </span>
                <span className="block text-[12px] leading-tight text-wa-meta">{names.short}</span>
              </span>
              {picking === company ? (
                <Spinner size={16} />
              ) : chosen ? (
                <Check
                  width={18}
                  strokeWidth={2.5}
                  className="shrink-0 text-success"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {lockedByServer ? (
        <Alert>{t('setup.companyLocked')}</Alert>
      ) : save.isError ? (
        <Alert>{t('setup.saveFailed')}</Alert>
      ) : null}

      {saved ? (
        <button
          type="button"
          onClick={() => {
            save.reset();
            setLockedByServer(false);
            setEditing(false);
          }}
          className="flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
        >
          {t('common.cancel')}
        </button>
      ) : null}
    </CardBox>
  );
}
