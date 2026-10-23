
import { formatDuration } from '@/lib/uploadAttachment';
import type { Lang } from '@/store/lang';
import type { GuideVideoListItem } from '@dk/shared/types';

/**
 * What the Help videos screen decides before it draws anything.
 *
 * Kept as plain functions so the rules are checkable without a screen: which
 * videos are shown, in which language their words are, and how a start second
 * becomes a link.
 */

/**
 * The videos a dealer can actually watch. The server already leaves out what must
 * not appear in the app (a video for WhatsApp only, the team's own videos); this
 * drops the ones it knows about but has not got a file for yet. A row that
 * cannot play is a dead control, and a dealer on a slow link should never have to
 * find that out by tapping it.
 */
export function playableVideos(list: GuideVideoListItem[] | undefined): GuideVideoListItem[] {
  return (list ?? []).filter((v) => v.available);
}

/** The video's own words follow the dealer's language; the voice in it is Hindi either way. */
export function videoTitle(v: GuideVideoListItem, lang: Lang): string {
  return v.title[lang] || v.title.hi || v.title.en;
}

export function videoSummary(v: GuideVideoListItem, lang: Lang): string {
  return v.summary[lang] || v.summary.hi || v.summary.en;
}

/** "0:49", or nothing when the length is not known (the row simply has no chip). */
export function durationLabel(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  return formatDuration(ms);
}

/**
 * The address the <video> plays. A start second is added as a media fragment
 * (`#t=`); with none, `#t=0.1` makes the phone show the first frame instead of a
 * black box. A link that already carries a fragment is left alone.
 */
export function playableSrc(url: string, startSec: number): string {
  if (url.includes('#')) return url;
  return `${url}#t=${startSec > 0 ? startSec : 0.1}`;
}
