import { Check, Phone } from 'lucide-react';

import { Button, Card, CardContent } from '@/components/ui';
import { fmtTime } from '@/lib/fmt';
import { HELPLINE } from '@/lib/helpline';
import { useLang, useT } from '@/lib/i18n';

/**
 * The card after a registration MDG's team still has to look at (spec 4.9): when it came in, what
 * happens next in three plain steps, a way to a person (the toll-free line, one tap to the dialler),
 * The last button goes back to Sign in, where this phone opens from now on.
 *
 * There is deliberately no "Getting started" video here (spec 4.9 item 3): the video list can only
 * be read with a signed-in session and this card is drawn before one exists. A test pins that.
 *
 * The call button is a plain `tel:` link. Its address is written out here rather than built from
 * `HELPLINE.href` because the leaving-the-app check counts every computed `href`; a test pins the
 * two to the same number.
 */
export function WaitingCard({
  receivedAt,
  email,
  onBack,
}: {
  receivedAt: Date;
  email: string;
  onBack: () => void;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <Card className="mt-4">
      <CardContent role="status" aria-live="polite" className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-status-ok-ink">
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-status-ok text-white">
            <Check width={16} strokeWidth={2.4} />
          </span>
          <span className="text-cta">{t('register.successBadge')}</span>
        </div>
        <div>
          <p className="text-heading text-text">{t('register.successTitle')}</p>
          <p className="mt-1 text-body text-text-muted">
            {t('first.wait.received', { time: fmtTime(receivedAt, lang) })}
          </p>
        </div>

        <div>
          <h2 className="text-subheading text-text">{t('first.wait.nextTitle')}</h2>
          <ol className="mt-2 flex flex-col gap-2">
            {(['first.wait.next1', 'first.wait.next2', 'first.wait.next3'] as const).map((key, i) => (
              <li key={key} className="grid grid-cols-[auto_1fr] gap-x-3">
                <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full border border-border-strong text-meta text-text">
                  {i + 1}
                </span>
                <p className="break-words text-body text-text">{t(key)}</p>
              </li>
            ))}
          </ol>
        </div>

        {email ? (
          <p className="text-body text-text-muted">{t('register.successEmail', { email })}</p>
        ) : null}

        <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
          <p className="text-body text-text">{t('first.wait.callTitle')}</p>
          <a
            href="tel:18008913496"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-cta text-text shadow-sm active:bg-surface-2"
          >
            <Phone aria-hidden width={18} strokeWidth={1.75} />
            <span>{t('first.wait.call')}</span>
            <span className="tabular-nums">{HELPLINE.display}</span>
          </a>
          <p className="text-meta text-text-muted">{t('auth.helpHours')}</p>
        </div>

        <Button size="lg" fullWidth onClick={onBack}>
          {t('register.back')}
        </Button>
      </CardContent>
    </Card>
  );
}
