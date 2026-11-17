import { Check, ChevronDown, ChevronUp, History } from 'lucide-react';
import * as React from 'react';

import { Button, Card, CardContent, Spinner, useToast } from '@/components/ui';
import { showLogin } from '@/hooks/api/useLogins';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';

import { IdValue } from './IdValue';
import { LoginForm } from './LoginForm';
import { LoginHistory } from './LoginHistory';
import { byLine, formatWhen } from './loginsView';
import { PasswordValue } from './PasswordValue';
import type { LoginRow } from './types';

/** What the chip beside a login's name says. */
function StatusChip({ row }: { row: LoginRow }) {
  const t = useT();
  if (row.status === 'saved') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-text">
        <Check width={13} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
        {t('chat.portalSaved')}
      </span>
    );
  }
  if (row.status === 'refused') {
    return (
      <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-strong">
        {t('chat.portalRefused')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-muted">
      {row.needed ? t('logins.status.missing') : t('chat.portalNotNeeded')}
    </span>
  );
}

/**
 * One platform: its name and where it stands, then what is needed to get it right.
 *
 *  - saved:    the ID and the password (dots until "Show"), when and by whom, and the
 *              buttons Change and History
 *  - missing:  the form, open, so filling it is one step — unless the services do not
 *              need it, when it waits behind "Add it"
 *  - refused:  the portal stopped accepting the password: the form, open, ID already in
 */
export function LoginCard({ row }: { row: LoginRow }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const [editing, setEditing] = React.useState<{ password: string } | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  const holding = row.status !== 'missing';
  const savedBy = row.savedBy ? byLine({ by: row.savedBy }, t) : '';

  /**
   * What the card shows, one at a time:
   *  - `change`   a saved login opened for editing, both fields filled in
   *  - `fill`     nothing saved and the services need it (or "Add it" was pressed)
   *  - `later`    nothing saved and nothing needs it: a line and "Add it"
   *  - `refused`  saved, but the portal stopped accepting it: the form, ID already in
   *  - `saved`    saved and working: the ID, the password, when and by whom, Change
   */
  const mode: 'change' | 'fill' | 'later' | 'refused' | 'saved' = editing
    ? 'change'
    : row.status === 'missing'
      ? row.needed || adding
        ? 'fill'
        : 'later'
      : row.status === 'refused'
        ? 'refused'
        : 'saved';

  // "Change" opens the form with both fields filled in. The password comes through the
  // same audited "show" as a tap on its eye.
  const startChange = async () => {
    setOpening(true);
    try {
      const got = await showLogin(row.portal);
      setEditing({ password: got.password });
    } catch {
      toast.error(t('logins.showFailed'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card data-testid={`login-${row.portal}`}>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold text-text">{row.name}</h2>
          <StatusChip row={row} />
        </div>

        {mode === 'later' ? (
          <>
            <p className="text-sm text-text-muted">{t('logins.notNeeded')}</p>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              {t('logins.add')}
            </Button>
          </>
        ) : null}

        {mode === 'fill' ? (
          <LoginForm
            portal={row.portal}
            lead={t('logins.missingLead')}
            onSaved={() => setAdding(false)}
            {...(adding ? { onCancel: () => setAdding(false) } : {})}
          />
        ) : null}

        {mode === 'refused' ? (
          <LoginForm
            portal={row.portal}
            initialUsername={row.username ?? ''}
            lead={t('logins.refusedLead', { name: row.name })}
            onSaved={() => undefined}
          />
        ) : null}

        {mode === 'change' && editing ? (
          <LoginForm
            portal={row.portal}
            initialUsername={row.username ?? ''}
            initialPassword={editing.password}
            lead={t('logins.changeLead')}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        ) : null}

        {mode === 'saved' && row.username ? (
          <>
            <div>
              <p className="text-xs font-medium text-text-muted">{t('chat.portalUserId')}</p>
              <IdValue value={row.username} name={row.name} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">{t('chat.portalPassword')}</p>
              <PasswordValue portal={row.portal} name={row.name} />
            </div>
            {row.savedAt ? (
              <p className="text-sm text-text-muted">
                {[t('logins.savedLine', { when: formatWhen(row.savedAt, lang) }), savedBy].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <Button variant="secondary" onClick={() => void startChange()} disabled={opening} fullWidth>
              {opening ? <Spinner size={16} /> : null}
              {opening ? t('logins.opening') : t('chat.portalChange')}
            </Button>
          </>
        ) : null}

        {row.history.length > 0 ? (
          <div className={cn('flex flex-col gap-3', historyOpen ? 'border-t border-border pt-3' : '')}>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              aria-label={`${row.name}: ${historyOpen ? t('logins.historyHide') : t('logins.history', { n: row.history.length })}`}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-base font-medium text-brand active:bg-surface-2"
            >
              <span className="flex items-center gap-2">
                <History width={18} strokeWidth={1.75} aria-hidden />
                {historyOpen ? t('logins.historyHide') : t('logins.history', { n: row.history.length })}
              </span>
              {historyOpen ? (
                <ChevronUp width={18} strokeWidth={1.75} aria-hidden />
              ) : (
                <ChevronDown width={18} strokeWidth={1.75} aria-hidden />
              )}
            </button>
            {historyOpen ? (
              <LoginHistory portal={row.portal} name={row.name} entries={row.history} holdingNow={holding} />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
