import type { MessageKey, TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';

import type { LoginVersion } from './types';

/**
 * The small decisions behind the page, kept apart from the drawing so they can be
 * tested without a screen.
 */

const LOCALES: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN' };

/**
 * "18 Nov 2026, 3:40 pm" — the moment a login changed, in the reader's language. Always
 * with the year, because a history is read back years later. Empty when the date cannot
 * be read.
 */
export function formatWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleString(LOCALES[lang], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    // Hindi short months end in the abbreviation sign ("अक्टू॰"), which reads as a stray mark.
    .replace(/॰/g, '');
}

/** The title of one history entry. */
export function entryTitleKey(e: Pick<LoginVersion, 'kind' | 'change'>): MessageKey {
  if (e.kind === 'removed') return 'logins.h.removed';
  switch (e.change) {
    case 'id':
      return 'logins.h.id';
    case 'password':
      return 'logins.h.password';
    case 'both':
      return 'logins.h.both';
    default:
      return 'logins.h.first';
  }
}

/** "by you", "by MDG team", "by Owner Two", or nothing when it is not known. */
export function byLine(
  e: Pick<LoginVersion, 'by' | 'byName' | 'viaReset'>,
  t: TFunction,
): string {
  if (e.by === 'unknown') return '';
  if (e.viaReset) return t('logins.by.reset');
  if (e.by === 'you') return t('logins.by.you');
  if (e.by === 'mdg') return t('logins.by.mdg');
  return e.byName ? t('logins.by.owner', { name: e.byName }) : t('logins.by.otherOwner');
}
