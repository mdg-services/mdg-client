/**
 * The AI first line on dealer support.
 *
 * A dealer sends a message. Today an unassigned ticket appears and a person
 * answers it, often forty minutes later. The first line is a machine that reads
 * the message, looks the answer up in MDG's own records, and either replies in
 * about three seconds or steps aside and leaves the ticket exactly where a human
 * would have found it.
 *
 * THE THREE PROPERTIES THIS FILE EXISTS TO ENFORCE
 * ------------------------------------------------
 * 1. THE MODEL CANNOT WRITE. Its entire output is {@link AiPlan}: one label out
 *    of {@link AI_FIRSTLINE_INTENTS} and a few scalars. There is no field on it
 *    a sentence fits in. Code maps the label to a lookup and fills a
 *    hand-written bilingual template, so every number a dealer reads traces back
 *    to a value a lookup returned. "The model cannot write" is a far stronger
 *    guarantee than "the model wrote and we checked it".
 * 2. AN AI MESSAGE IS AN ADMIN MESSAGE. There is no `'ai'` sender role — see
 *    {@link MessageAiMeta} for the screen that would break if there were.
 * 3. AN AI THREAD IS AN ORDINARY OPEN THREAD. There is no fourth
 *    `ConversationStatus`; the machine's state lives in the optional
 *    {@link ConversationAiState} block instead. A fifth status would drop the
 *    thread out of every inbox tab and four of the five counts while the dealer
 *    sat waiting.
 *
 * Nothing here reaches a dealer until that dealer's own
 * {@link DealerFirstLineMode} is switched on, and it is `'OFF'` for everybody
 * until somebody at MDG says otherwise.
 */

/**
 * The two languages the dealer app speaks, and therefore the only two the first
 * line may answer in.
 *
 * NOT `ASSIST_LANGS`. That list belongs to the landing-page assistant, whose
 * audience is an anonymous visitor on mdgservices.in; this one belongs to a
 * logged-in dealer. They happen to hold the same two values today, and importing
 * one into the other would tie a dealer's support reply to a decision made about
 * a marketing widget.
 *
 * It is also NOT `User.lang`, which is the language the dealer set in the app.
 * This is the language of THIS message: an owner whose app is in English still
 * types "aaj ka DSR aaya kya" and should be answered the way they asked.
 */
export const AI_FIRSTLINE_LANGS = ['hi', 'en'] as const;
export type AiFirstLineLang = (typeof AI_FIRSTLINE_LANGS)[number];

/**
 * Every label the model is allowed to emit, and nothing else.
 *
 * The list is derived from what the lookups can ACTUALLY answer, not from what a
 * dealer might plausibly ask. That direction matters: a label with no lookup
 * behind it is a promise the code cannot keep, and the failure it produces is
 * the worst kind — a confident reply about a service the dealer is not even on.
 * When the machine cannot place a message on this list it emits `other`, which
 * is a handoff, which is a person. Giving up is a supported outcome here, not an
 * error path.
 *
 * The comment on each label is the question a dealer actually types, in the
 * words they actually use.
 */
export const AI_FIRSTLINE_INTENTS = [
  /** "namaste", "hello sir", "kaise ho" — an opening with no question in it yet. */
  'greeting',
  /** "aaj ka DSR aaya?" — is today's Daily Sales Report ready. */
  'dsr_status',
  /** "22 tarikh ka DSR bhejo" — the report for one named day. */
  'dsr_for_date',
  /** "DSR dobara bhej do, delete ho gaya" — send the same report again. */
  'dsr_reshare',
  /** "aaj ki density kya hai" — the density reading recorded for today. */
  'density_today',
  /** "density kyun nahi aayi" — why is a day's density figure missing. */
  'density_missing',
  /** "kal ki density batao" — the reading for an earlier named day. */
  'density_backdate',
  /** "last density kab ki hai" — the most recent reading, whenever it was. */
  'density_latest',
  /** "kya kya bhejna hai" — what Kavach is currently waiting on from the dealer. */
  'kavach_asks',
  /** "fire extinguisher kab check hua tha" — when a task was last verified. */
  'kavach_last_verified',
  /** "is mahine ke total points kitne hue" — the team's points for a month. */
  'staff_total',
  /** "Ramesh ke kitne points hain" — one named employee's points. */
  'staff_person',
  /** "Suresh ki chhutti lagi hai kya" — whether an employee is marked on leave. */
  'staff_leave',
  /** "points kab submit hue the" — when the last batch was finalised. */
  'staff_last_batch',
  /** "hamari kaunsi services chalu hain" — which services this outlet is on. */
  'services_list',
  /** "aaj ka kaam hua kya" — whether a named service ran, and what it did. */
  'service_log',
  /** "purane papers kahan hain" — what documents are filed for this outlet. */
  'records_list',
  /** "wo licence wali file bhej do" — send one filed document again. */
  'record_send',
  /** "kya kya paper baaki hai" — which papers MDG is still waiting for. */
  'docs_pending',
  /** "kisi se baat karao", "call me" — an explicit request for a person. */
  'talk_to_human',
  /**
   * None of the above.
   *
   * The give-up label, and it must stay cheap to reach. A model that is rewarded
   * for always finding a label is a model that answers a complaint about a
   * pending payment with last Tuesday's density reading.
   */
  'other',
] as const;
export type AiFirstLineIntent = (typeof AI_FIRSTLINE_INTENTS)[number];

/**
 * A fuel grade, in the vocabulary the rest of the platform already speaks.
 *
 * Deliberately the four keys `dsr/products.ts` and `tt/materials.ts` both
 * produce — `MS`, `HSD`, `XP`, `XG` — so a hint the model emits joins straight
 * onto a product row without a translation table nobody maintains.
 *
 * It is a closed list rather than a free string for the same reason everything
 * else here is: a grade name the model invented would go into a lookup, miss,
 * and turn into a handoff at best. A dealer asking about a grade outside this
 * list simply produces no hint, and the answer then covers every grade the
 * outlet takes — which is the right answer to an ambiguous question anyway.
 */
export const AI_PRODUCT_HINTS = ['MS', 'HSD', 'XP', 'XG'] as const;
export type AiProductHint = (typeof AI_PRODUCT_HINTS)[number];

/**
 * The model's ENTIRE output. There is nothing else it may return.
 *
 * THIS IS THE CENTRAL SAFETY PROPERTY OF THE WHOLE FEATURE, not a convenience or
 * a first cut to be relaxed later. There is no free-text field on this object,
 * so there is no path by which a sentence the model composed can reach a dealer.
 * The plan selects a lookup and parameterises it; a hand-written bilingual
 * template does the writing. Adding a `note`, a `summary`, an `answer` or a
 * `reason` string here would quietly convert this feature from "a machine that
 * chooses between twenty-one hand-written answers" into "a machine that talks to
 * our customers", and those are different products with different risks.
 *
 * `personName` is the one string, and it is not an exception — see its comment.
 */
export interface AiPlan {
  intent: AiFirstLineIntent;
  /** The language THIS message was written in, which is the language to answer in. */
  lang: AiFirstLineLang;
  /**
   * An IST calendar day, `YYYY-MM-DD`. IST days are strings everywhere in this
   * codebase and this is no exception: the moment a business day becomes a
   * `Date` it acquires a timezone it does not have.
   */
  date?: string;
  /** An IST calendar month, `YYYY-MM`. */
  month?: string;
  /**
   * An employee's name as the dealer typed it — "Ramesh", "ramesh kumar".
   *
   * A string, and the only one, but NOT a hole in the rule above. It is a LOOKUP
   * KEY, never output: it is matched against the dealer's own employee list, and
   * what a dealer reads back is the name stored on that employee record. A value
   * that matches nobody is a `tool_refused` handoff, not a guess. The schema caps
   * it at a length and a shape a name fits in and a sentence does not.
   */
  personName?: string;
  /** Which grade the question was about, when it named one. */
  productHint?: AiProductHint;
}

/**
 * What became of one turn of the first line.
 *
 * `SUPPRESSED` and `SUPERSEDED` are the two silences and they are not the same
 * thing. Suppressed means the machine declined to act at all (the dealer's mode
 * is off, the kill switch is down, the thread is already assigned to a person).
 * Superseded means it was acting and the world moved underneath it — most often
 * the dealer sent another message, or an admin picked the ticket up, while the
 * model was still thinking. Keeping them apart is what lets somebody read the
 * turn log and tell "we chose not to" from "we lost the race".
 *
 * `SHADOW` is a turn that ran end to end and posted nothing, because the dealer
 * is in `'SHADOW'` mode. It is its own outcome rather than a flag on `ANSWERED`
 * so that no count of what the machine said can ever accidentally include a week
 * of dress rehearsal.
 */
export const AI_TURN_OUTCOMES = [
  'ANSWERED',
  'HANDED_OFF',
  'SUPPRESSED',
  'SUPERSEDED',
  'SHADOW',
] as const;
export type AiTurnOutcome = (typeof AI_TURN_OUTCOMES)[number];

/**
 * Why a thread went to a person. A closed list, and it stays closed.
 *
 * THERE IS NO CONFIDENCE SCORE ANYWHERE IN THIS STACK, and that is a decision
 * rather than an omission: `generateContent` as this codebase calls it returns
 * no logprobs, so any number we printed next to "confidence" would be one we
 * made up. So handing off is not a threshold — it is an enumeration of things
 * that HAPPENED. Every entry below is an event somebody can point at.
 *
 * That is also the cheaper design and by a long way the easier one to explain.
 * An admin at nine at night reading "the dealer attached a photo" understands
 * immediately why the machine stood down. "Confidence 0.62" tells them nothing
 * they can act on and invites an argument about the threshold.
 */
export const AI_HANDOFF_REASONS = [
  /** The dealer sent a photo, a voice note or a file. The first line reads none of them. */
  'attachment',
  /** A manager's group thread — several people are talking, so a machine should not. */
  'group_thread',
  /** They asked for a person, in any language. Always granted, never argued with. */
  'asked_for_human',
  /** The input guard stopped it before the model saw it (abuse, an injection attempt). */
  'guard_in',
  /** This dealer has used their turns for the day. */
  'quota',
  /** The first line's own daily budget is spent. Its own purse — see the AiTurn cost fields. */
  'budget',
  /** The machine has already answered this thread more times than it should have. */
  'repeat',
  /**
   * The dealer wrote again, soon, on a thread the machine had just answered.
   *
   * The strongest signal available that the answer missed, and it costs nothing
   * to read: no model call, no paise. It exists because clearing the SLA clock is
   * exactly right when the dealer got what they needed and catastrophic when they
   * did not, and this is the moment we find out which.
   */
  'follow_up',
  /** The model returned `other`, or no label the code could place. */
  'no_intent',
  /** The lookup ran and declined — no such employee, no report for that day, service not on. */
  'tool_refused',
  /** The lookup threw. A person answers; nobody gets an apology from a machine. */
  'tool_error',
  /** The output guard rejected the finished template before it was posted. */
  'guard_out',
  /** The model returned something that is not a valid plan. Malformed JSON, an unknown label. */
  'bad_router_output',
  /** The model call itself failed. */
  'model_error',
  /** The vendor was busy or too slow, and a dealer waiting on a spinner is worse than a person. */
  'vendor_busy',
] as const;
export type AiHandoffReason = (typeof AI_HANDOFF_REASONS)[number];

/**
 * The `ai` block on a Message — the ONLY thing that marks a message as machine-made.
 *
 * WHY THIS IS A NEW OPTIONAL FIELD AND NOT A NEW `senderRole` VALUE
 * ----------------------------------------------------------------
 * `mdg-admin/src/features/chat/MessageBubble.tsx` decides which side of the
 * thread a bubble belongs on with one line:
 *
 *     const adminSide = message.senderRole === 'admin';
 *
 * An unrecognised role is falsy there, so a message sent as `'ai'` would render
 * on the LEFT — visually identical to something the dealer typed, in the one
 * screen whose entire job is telling us from them. The role union is also a
 * Mongo enum that throws a ValidationError on an unknown value, and it is
 * written out four times across the vendored copies of this package.
 *
 * So an AI reply is `senderRole: 'admin'`, `system: false`, sent as the existing
 * "MDG System" user, and carries this block. A client that has never heard of it
 * ignores an unknown JSON key and draws an ordinary Support bubble — correct,
 * merely unlabelled — which is what lets the backend ship, and run a whole
 * shadow week, before any app is updated.
 */
export interface MessageAiMeta {
  /** Joins this message to its {@link AiTurn}. One turn posts at most one message. */
  turnId: string;
  /**
   * What this message IS. `'answer'` carries figures; `'handoff'` is the one warm
   * line before a person takes over; `'reshare'` re-sends something MDG already
   * sent, which is a different act from answering and is counted separately.
   */
  kind: 'answer' | 'handoff' | 'reshare';
  intent: AiFirstLineIntent;
  /** Which hand-written template filled this message. The wording is auditable from here. */
  templateId: string;
  /**
   * Set when this was posted during a shadow run. Absent means live.
   *
   * A message can only be shadow-flagged if the experiment posted it on purpose;
   * ordinary shadow mode posts nothing at all and the TURN records `'SHADOW'`.
   * The flag exists so that if we ever do post during a rehearsal, no later count
   * of "what the machine told dealers" can quietly include it.
   */
  shadow?: boolean;
}

/** Where a thread stands with the machine. Not a conversation status — see below. */
export const AI_CONVERSATION_STATES = ['IDLE', 'ANSWERED', 'HANDED_OFF'] as const;
export type AiConversationState = (typeof AI_CONVERSATION_STATES)[number];

/**
 * The `ai` block on a Conversation.
 *
 * This is deliberately NOT a fourth `ConversationStatus`. `conversations.ts`
 * defines the "all" tab as `{status: {$in: ['OPEN','ASSIGNED']}}`, `/counts` runs
 * five fixed `countDocuments`, and `InboxPage.tsx` hardcodes four filter keys and
 * falls through its if-chain to label anything unknown "Resolved". A fifth status
 * would therefore make an AI-handled thread vanish from every tab and four of the
 * five counts, and appear as resolved in the fifth, while a dealer sat waiting on
 * it. The machine lives entirely inside `OPEN`.
 */
export interface ConversationAiState {
  state: AiConversationState;
  /** The turn that put the thread in this state. */
  turnId?: string;
  /**
   * When the machine last answered on this thread. Read together with `state`
   * to spot the dealer who writes straight back because the answer was wrong.
   */
  lastAnsweredAt?: string;
  /**
   * How many times running the machine has answered this thread with no person in
   * between. Reset when an admin posts. Feeds the `repeat` handoff reason: three
   * machine answers in a row is a conversation, and a conversation is a person's job.
   */
  streak: number;
  /** Why it stood down last, when it did. */
  lastReason?: AiHandoffReason;
}

/**
 * Whether the first line runs for one dealer, and how far.
 *
 * `'SHADOW'` runs the whole turn — guard, model, lookup, template — and posts
 * NOTHING. It writes an {@link AiTurn} with outcome `'SHADOW'`, so a week of it
 * produces a reviewable record of exactly what the machine would have said to
 * real dealers about real days, at real cost, with no dealer ever seeing it.
 */
export const DEALER_FIRSTLINE_MODES = ['OFF', 'SHADOW', 'ON'] as const;
export type DealerFirstLineMode = (typeof DEALER_FIRSTLINE_MODES)[number];

/**
 * Off, for everybody, until a named person turns it on for one named dealer.
 *
 * A default of `'ON'` would mean that adding a dealer to the platform silently
 * enrols them in being answered by a machine, and nobody would have decided that
 * about them. Every read of the mode must go through this default rather than
 * treating an absent value as enabled.
 */
export const DEALER_FIRSTLINE_MODE_DEFAULT: DealerFirstLineMode = 'OFF';

/**
 * An admin's judgement on one turn, recorded from the turn log.
 *
 * `'SHOULD_HAVE_HANDED_OFF'` says the answer was not wrong, it was merely the
 * wrong thing to do — the dealer needed a person and got a correct paragraph
 * about density instead.
 */
export const AI_TURN_VERDICTS = ['RIGHT', 'WRONG', 'SHOULD_HAVE_HANDED_OFF'] as const;
export type AiTurnVerdict = (typeof AI_TURN_VERDICTS)[number];

export interface AiTurnReview {
  verdict: AiTurnVerdict;
  at: string;
  byAdminId: string;
}

/**
 * Does this verdict count towards tripping the breaker that shuts the first line
 * off? ONLY `'WRONG'`.
 *
 * "This should have been a handoff" is a tuning signal, not evidence the machine
 * lied — the figures it printed were right and traceable, it just should have
 * stayed quiet. Counting those would mean the breaker fires hardest in exactly
 * the week the team is reviewing most carefully and finding the most nuance, and
 * the feature would be switched off for being too well supervised.
 *
 * A helper rather than a comparison at the call site because the breaker, the
 * admin's turn list, and any later dashboard must all agree on what "wrong"
 * means, and three copies of a rule is how they stop agreeing.
 */
export function aiVerdictTripsBreaker(verdict: AiTurnVerdict | undefined | null): boolean {
  return verdict === 'WRONG';
}

/**
 * One turn of the first line, as the admin turn log shows it.
 *
 * The money fields are on the TURN because the first line keeps its own purse.
 * `assist/cost.ts` holds the LANDING assistant's daily budget, and the slip
 * reader already refuses to touch it — "a busy morning at one petrol pump can
 * never be the reason a visitor to mdgservices.in is told to leave their number.
 * Two purses, two lids." This is the third purse and it follows the same rule.
 * `istDate` is the day the money was spent, in IST, because that is the window
 * the budget is counted over — not the day the turn was reviewed, and not UTC.
 */
export interface AiTurn {
  id: string;
  /** Stable id shared with {@link MessageAiMeta.turnId} and {@link ConversationAiState.turnId}. */
  turnId: string;
  dealerId: string;
  /** The dealer's code, decorated by the API — a dealer IS its code. */
  dealerCode?: string;
  conversationId: string;
  /** The dealer message that started this turn. */
  inboundMessageId: string;
  /** What we posted. Absent for every outcome that posted nothing. */
  outboundMessageId?: string;
  outcome: AiTurnOutcome;
  /**
   * Why it stood down. Always set on `HANDED_OFF`, and also on a `SUPPRESSED`
   * turn that had a nameable cause.
   *
   * A manager's group thread is the case that settles this. It is on the list
   * above, and the machine must stay SILENT there — several people are talking,
   * and a warm line saying a person is coming is still the machine talking — so
   * that turn posts nothing and its outcome is `SUPPRESSED`. If the reason could
   * not ride along, "why does the first line never speak in the manager thread?"
   * would have no answer in the turn log at all, and the alternative is a second
   * vocabulary for the same fifteen facts. `aiTurnListQuerySchema` already
   * filters `outcome` and `reason` independently, which only makes sense if the
   * two are not locked together.
   *
   * The three genuinely reason-less suppressions are the switches: the env flag,
   * the kill switch, and a dealer whose own mode is `'OFF'`. Nothing happened
   * there because nothing was ever switched on.
   */
  reason?: AiHandoffReason;
  /** What the model made of the message. Absent when it never ran. */
  intent?: AiFirstLineIntent;
  lang: AiFirstLineLang;
  /** The whole plan, kept so a bad answer can be traced to the label that caused it. */
  plan?: AiPlan;
  /** Which template was filled, when one was. */
  templateId?: string;
  /** Which lookups ran, in order. Names, not payloads: a turn log is not a data export. */
  toolIds?: string[];
  /**
   * What the dealer asked, and what the machine said back.
   *
   * Both halves, because an admin judging a turn `WRONG` needs both and there is
   * nowhere else to read them together. The outbound half can be found in the
   * thread when there IS one — but a turn that handed off, or that ran in
   * shadow, posted nothing at all, and those are precisely the turns worth
   * reading. Truncated at the server: this is a review record, not a transcript
   * archive.
   */
  question?: string;
  answer?: string;
  /** The model id actually called, so a regression can be pinned to a version. */
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /**
   * Estimated spend for this turn in paise. Zero is a real value, not a missing
   * one — a `follow_up` handoff costs nothing because no model is called.
   */
  estPaise: number;
  /** Wall-clock time the dealer waited. The whole promise is ~3 seconds. */
  latencyMs?: number;
  /** IST calendar day (`YYYY-MM-DD`) the spend belongs to. */
  istDate: string;
  createdAt: string;
  review?: AiTurnReview;
}
