import { Repeat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLang, useT } from '@/lib/i18n';
import type { DealerAutopay } from '@dk/shared/types';

import { autopaySubtitle } from './autopayView';

/**
 * The Autopay row at the top of Settings → Help videos: the same row as "Ask in
 * chat" under the list, with the state of autopay on the second line.
 *
 * The page hands it the owner's autopay (`useOwnerAutopay`) and draws it only
 * when there is one: while it loads, if it fails, when there is none and for a
 * manager the row is simply absent, and the videos below never wait on it. It
 * opens the Autopay screen, which can stop it; the row itself leads nowhere else
 * and says nothing about turning it on.
 */
export function AutopayHelpRow({ autopay }: { autopay: DealerAutopay }) {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();

  return (
    <ul className="border-b border-wa-divider">
      <li>
        <button
          type="button"
          onClick={() => navigate('/settings/autopay')}
          className="flex min-h-[64px] w-full items-center gap-5 px-5 py-2.5 text-left active:bg-wa-row-active"
        >
          <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center text-wa-bar-icon">
            <Repeat width={24} height={24} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] text-wa-bar-text">{t('autopay.title')}</span>
            {/* Wraps to a second line: an amount and a day do not fit one at 320px in Hindi. */}
            <span className="block text-[14px] leading-snug text-wa-meta">
              {autopaySubtitle(t, lang, autopay)}
            </span>
          </span>
        </button>
      </li>
    </ul>
  );
}
