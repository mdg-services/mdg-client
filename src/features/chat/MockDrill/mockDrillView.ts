import { ApiError } from '@/lib/api';
import type { TFunction } from '@/lib/i18n';
import { PhotoRejected } from '@/lib/uploadMockDrillPhoto';
import type {
  MockDrillDependentView,
  MockDrillPhotoView,
  MockDrillScenarioOption,
  MockDrillStep,
  MockDrillView,
} from '@dk/shared/types';

import { formatDmy } from '../duOtpView';

/**
 * The small decisions behind the Mock Drill box (ADR 0034), kept apart from the
 * drawing so they can be tested without a screen.
 */

/**
 * A short Hindi gloss for the portal's English scenario names. Only the ones that
 * can be said in Hindi with no doubt about the meaning have one; the rest are shown
 * in the portal's own English words alone. The ids are the portal's own and never
 * change, so the gloss is keyed on the id, never on the label's text.
 */
const SCENARIO_GLOSS_HI: Readonly<Record<string, string>> = {
  e1: 'फ़्लैंज, पाइप या वाल्व से तेल का रिसाव',
  e2: 'पाइप में बारीक छेद से रिसाव',
  e3: 'गैस्केट ख़राब होने से रिसाव',
  e4: 'तेल उतारते समय स्टोरेज टैंक से तेल गिरना',
  e6: 'जंग लगने से ख़राबी',
  e8: 'रोड टैंकर में ख़राबी',
  e9: 'पाइप का पूरा फट जाना',
  e12: 'बाहरी भीड़ का हंगामा या ज़बरदस्ती घुसना',
  e13: 'भूकंप, बाढ़ जैसी प्राकृतिक आपदा',
  e14: 'तोड़फोड़, बम धमाका, धमकी',
  e15: 'टैंकर से तेल उतारते समय आग',
  e16: 'टैंकर से तेल उतारते समय तेल गिरना',
  e17: 'पैनल में बिजली से आग',
  e18: 'DU में बिजली से आग',
  e19: 'सेल्स बिल्डिंग में बिजली से आग',
  e20: 'स्टाफ़ या ठेका मज़दूर को बिजली का झटका',
  e21: 'ग्राहक की गाड़ी में आग',
  e22: 'ऊँचाई से गिरना',
  e23: 'गाड़ी DU से टकराई, सिर्फ़ रिसाव',
  e24: 'गाड़ी DU से टकराई, रिसाव और आग',
  e25: 'स्टाफ़ को गाड़ी की टक्कर',
};

/** The Hindi gloss for a scenario id, or null where there is none. */
export function scenarioGloss(id: string): string | null {
  return SCENARIO_GLOSS_HI[id] ?? null;
}

/**
 * The dropdown's two groups: the ones an outlet really practises first, in the
 * order the server sent them, then the rest.
 */
export function splitScenarios(scenarios: readonly MockDrillScenarioOption[]): {
  common: MockDrillScenarioOption[];
  more: MockDrillScenarioOption[];
} {
  return {
    common: scenarios.filter((s) => s.common),
    more: scenarios.filter((s) => !s.common),
  };
}

/**
 * The scenario's name as the box writes it: the portal's English label, and, in
 * Hindi, the gloss when there is one. The label stays because it is what the
 * outlet will see on the portal.
 */
export function scenarioName(
  id: string,
  label: string,
  scenarios: readonly MockDrillScenarioOption[],
): { label: string; gloss: string | null } {
  const fromList = scenarios.find((s) => s.id === id)?.label;
  return { label: fromList ?? label, gloss: scenarioGloss(id) };
}

/** The drill details the box shows: the open submission's, or the outlet's saved setup. */
export function dependentOf(view: MockDrillView): MockDrillDependentView | null {
  return view.open?.dependent ?? view.setup ?? null;
}

/**
 * The photo in a slot (1 or 2). The server keeps the photos in the order they
 * were given, so slot N is the Nth.
 */
export function photoInSlot(
  dependent: Pick<MockDrillDependentView, 'photos'> | null | undefined,
  slot: 1 | 2,
): MockDrillPhotoView | null {
  return dependent?.photos[slot - 1] ?? null;
}

/** The step the box is on, when it is collecting. */
export function stepOf(view: MockDrillView): MockDrillStep {
  return view.open?.step ?? (view.setup ? 'choose' : 'scenario');
}

/**
 * Whether "वापस" has somewhere to go. The first question has nothing before it,
 * unless a "same / new" choice came first.
 */
export function canGoBack(step: MockDrillStep, view: Pick<MockDrillView, 'setup'>): boolean {
  if (step === 'choose') return false;
  if (step === 'scenario') return view.setup !== null;
  return true;
}

/** dd-mm-yyyy of the day the owner said the drill was done. */
export function drillDay(view: MockDrillView): string | null {
  return formatDmy(view.open?.confirmedDay ?? null);
}

/** The day the report went on the portal, dd-mm-yyyy. */
export function filedDay(view: MockDrillView): string | null {
  return formatDmy(view.open?.submittedAt ?? view.lastSubmittedAt);
}

/**
 * The words under an answer or an upload that did not go through.
 *
 * The server's own words are shown for a refusal (4xx): the route answers in plain
 * words. A rate limit, a dropped connection or a server fault says it its own way,
 * because what the server says there is for engineers.
 */
export function mockDrillErrorText(err: unknown, t: TFunction, what: 'answer' | 'photo'): string {
  if (err instanceof PhotoRejected) {
    return err.reason === 'size' ? t('chat.mockDrillTooBig') : t('chat.mockDrillBadType');
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return t('chat.portalRateLimited');
    const words = err.message.trim();
    if (err.status >= 400 && err.status < 500 && words) return words;
  }
  return what === 'photo' ? t('chat.duOtpFileFailed') : t('chat.portalSaveFailed');
}
