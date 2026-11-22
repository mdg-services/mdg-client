/**
 * The one-tap questions above the chat box: which ones a dealer is shown, and when.
 *
 * Until 23 Nov 2026 every dealer saw the same two ("Today's report?" and "What do I
 * need to do?"), on every day of their life with us. A dealer in the middle of setup
 * has no report yet, so they tapped the first one at random and got an answer about
 * setup instead, which only confused them (live chat, 22 Nov, 22:49 and 22:50). A dealer
 * who has been live for months never learns that the chat can place a fuel order or
 * read the tank stock, because nothing in the app ever says so.
 *
 * So the chips follow where the dealer is:
 *
 *  - SETUP. While the outlet is on its way to live service the chips are about that
 *    step, and only about it: what to do now, where the setup is, when services start.
 *  - LIVE. Once services run, the chips are things this outlet can really ask for, the
 *    ones it has NOT asked for yet first (a stock check before "today's report" if the
 *    dealer has never asked for a stock check), so each chip is one more thing the
 *    chat can do for them.
 *
 * THE SENTENCES. A live chip is never newly written: it is one of the sentences in
 * `YOUR_VIDEOS`, the list that `yourVideos.examples.test.ts` runs through the very
 * readers that route a dealer's message. A chip that the assistant would not act on is
 * worse than no chip. The setup sentences below are the ones the first line answers
 * from the setup briefing (`assist/firstline/brief/setup.ts`): where the setup is stuck,
 * what comes next, the bill-details card and the login box.
 *
 * Pure on purpose: the server reads the three facts (setup, attached services, what was
 * already asked for) and calls this; the app only draws what comes back.
 */
import type { SomeDealerWords } from '../types/dealerLanguage';
import type { SetupStage } from '../types/outletSetup';
import { YOUR_VIDEOS } from './yourVideos';

/** What `GET /me/chat-suggestions` answers. */
export interface ChatSuggestions {
  /** Which kind of chips these are. The app draws both the same way. */
  mode: 'setup' | 'live';
  /** In the order to show them. At most {@link MAX_SUGGESTIONS}. Empty = show none. */
  items: SomeDealerWords[];
}

/** Chips scroll sideways on a 360 px phone: three is what fits before it feels like a menu. */
export const MAX_SUGGESTIONS = 3;

// ── Setup ──────────────────────────────────────────────────────────────────

const ASK_NEXT: SomeDealerWords = {
  hl: 'Ab kya karna hai?',
  hi: 'अब क्या करना है?',
  en: 'What do I need to do now?',
};
const ASK_WHERE: SomeDealerWords = {
  hl: 'Setup kahan tak hua?',
  hi: 'सेटअप कहाँ तक हुआ?',
  en: 'Where has my setup reached?',
};
const ASK_WHEN: SomeDealerWords = {
  hl: 'Service kab chalu hongi?',
  hi: 'सेवाएँ कब चालू होंगी?',
  en: 'When will my services start?',
};
const ASK_FIRST_REPORT: SomeDealerWords = {
  hl: 'Pehli report kab aayegi?',
  hi: 'पहली रिपोर्ट कब आएगी?',
  en: 'When will I get my first report?',
};
const ASK_LOGIN: SomeDealerWords = {
  hl: 'Login kahan dalna hai?',
  hi: 'लॉगिन कहाँ डालना है?',
  en: 'Where do I enter my login?',
};
const ASK_BILL_DETAILS: SomeDealerWords = {
  hl: 'Bill ka naam aur pata kahan bharun?',
  hi: 'बिल का नाम और पता कहाँ भरूँ?',
  en: 'Where do I fill in the bill name and address?',
};
/** Nothing about paying: the app never says where or how to pay (Google Play, ADR 0022). */
const SETUP_CHIPS: Record<Exclude<SetupStage, 'live' | 'lost'>, readonly SomeDealerWords[]> = {
  sign_in: [ASK_NEXT, ASK_WHERE],
  company: [ASK_NEXT, ASK_WHERE],
  billing: [ASK_BILL_DETAILS, ASK_WHERE],
  // The bill is out and the next move is MDG's, so "what do I do" would only get "wait".
  payment: [ASK_WHERE, ASK_WHEN],
  logins: [ASK_LOGIN, ASK_WHERE],
  setup: [ASK_WHERE, ASK_WHEN, ASK_FIRST_REPORT],
  watch: [ASK_WHERE, ASK_FIRST_REPORT],
};

// ── Live ───────────────────────────────────────────────────────────────────

/**
 * The services worth a chip, most useful first: what a pump owner asks for most, and what
 * the chat does that nothing else on the screen does. Anything else in `YOUR_VIDEOS`
 * follows in that list's own order.
 */
const LIVE_PRIORITY: readonly string[] = [
  'fuel-indent',
  'stock-check',
  'credit-dod-monitoring',
  'dsr-report',
  'load-planner',
  'ro-supply-status',
  'water-ingress-testing',
];

/**
 * Which of a service's sentences leads, where the first is not the best opener. The DSR
 * list starts with "send yesterday's again", which makes no sense to a dealer who has
 * never received one; the second asks for today's sales.
 */
const OPENER_AT: Readonly<Record<string, number>> = { 'dsr-report': 1 };

/** Always answerable, so it fills the row for an outlet with few services running. */
const ASK_SERVICES: SomeDealerWords = {
  hl: 'Meri kaunsi services chalu hain?',
  hi: 'मेरी कौन सी सेवाएँ चालू हैं?',
  en: 'Which of my services are running?',
};

/** One sentence per service, in the order {@link LIVE_PRIORITY} then `YOUR_VIDEOS`. */
function liveCandidates(): Array<{ service: string; words: SomeDealerWords }> {
  const byService = new Map<string, SomeDealerWords[]>();
  for (const entry of YOUR_VIDEOS) {
    const list = byService.get(entry.service) ?? [];
    list.push(...entry.examples);
    byService.set(entry.service, list);
  }
  const order = [
    ...LIVE_PRIORITY,
    ...[...byService.keys()].filter((s) => !LIVE_PRIORITY.includes(s)),
  ];
  const out: Array<{ service: string; words: SomeDealerWords }> = [];
  for (const service of order) {
    const examples = byService.get(service);
    if (!examples?.length) continue;
    const words = examples[OPENER_AT[service] ?? 0] ?? examples[0];
    if (words) out.push({ service, words });
  }
  return out;
}

// ── The choice ─────────────────────────────────────────────────────────────

export interface ChatSuggestionsInput {
  /** The outlet's setup now (`GET /me/setup`'s `active` and `stage`); null when unknown. */
  setup: { active: boolean; stage: SetupStage } | null;
  /** Ids of the services running for this outlet (status ACTIVE). */
  attached: readonly string[];
  /** Ids of the services someone at this outlet has already asked for in the chat. */
  used: readonly string[];
}

export function chatSuggestions(input: ChatSuggestionsInput): ChatSuggestions {
  const { setup } = input;
  if (setup?.active && setup.stage !== 'live' && setup.stage !== 'lost') {
    return { mode: 'setup', items: [...SETUP_CHIPS[setup.stage]].slice(0, MAX_SUGGESTIONS) };
  }

  const attached = new Set(input.attached);
  const used = new Set(input.used);
  const mine = liveCandidates().filter((c) => attached.has(c.service));
  // The ones never asked for lead; the rest follow, so the row is never empty for a
  // dealer who has tried everything.
  const ranked = [...mine.filter((c) => !used.has(c.service)), ...mine.filter((c) => used.has(c.service))];
  const items = ranked.slice(0, MAX_SUGGESTIONS).map((c) => c.words);
  if (items.length < MAX_SUGGESTIONS) items.push(ASK_SERVICES);
  if (items.length < MAX_SUGGESTIONS) items.unshift(ASK_NEXT);
  return { mode: 'live', items };
}
