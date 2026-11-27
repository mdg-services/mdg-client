import { useLang, useT } from '@/lib/i18n';

import { IdValue } from './IdValue';
import { byLine, entryTitleKey, formatWhen } from './loginsView';
import { PasswordValue } from './PasswordValue';
import type { LoginPortal, LoginVersion } from './types';

/**
 * What a login was before: every time its ID or password changed, newest first. Each saved
 * entry shows the ID it had and a "Show" for the password it had, so an old pair can be
 * read back. A change of ID says what it was before.
 */
export function LoginHistory({
  portal,
  name,
  entries,
  holdingNow,
}: {
  portal: LoginPortal;
  name: string;
  entries: readonly LoginVersion[];
  /** The login is in now, so the newest saved entry is the one in use. */
  holdingNow: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const nowId = holdingNow ? entries.find((e) => e.kind === 'saved')?.id : undefined;
  return (
    <ol aria-label={name} className="flex flex-col">
      {entries.map((e) => {
        const by = byLine(e, t);
        return (
          <li key={e.id} className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-text">{t(entryTitleKey(e))}</span>
                {e.id === nowId ? (
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-meta font-medium text-brand">
                    {t('logins.h.now')}
                  </span>
                ) : null}
              </div>
              <p className="text-meta text-text-muted">{[formatWhen(e.at, lang), by].filter(Boolean).join(' · ')}</p>
            </div>
            {e.kind === 'saved' && e.username ? (
              <>
                <div>
                  <p className="text-meta font-medium text-text-muted">{t('chat.portalUserId')}</p>
                  <IdValue value={e.username} name={name} />
                  {e.previousUsername ? (
                    <p className="text-meta text-text-muted">{t('logins.h.was', { id: e.previousUsername })}</p>
                  ) : null}
                </div>
                <div>
                  <p className="text-meta font-medium text-text-muted">{t('chat.portalPassword')}</p>
                  <PasswordValue portal={portal} name={name} versionId={e.id} />
                </div>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
