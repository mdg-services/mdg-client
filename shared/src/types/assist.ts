/**
 * The landing-page assistant (ADR 0009).
 *
 * A visitor on mdgservices.in who has never logged in asks a question — typed,
 * spoken as a voice note, or spoken live on a browser call — and gets an answer
 * drawn only from the Marketing Discipline Guidelines and a written description
 * of what MDG Services does.
 *
 * Everything here describes an ANONYMOUS person. There is no `dealerId` and no
 * `userId` anywhere in this domain, and there deliberately never will be: the
 * whole point is that the visitor has not signed up yet. The only identity we
 * ever hold is what they volunteer — a name, a place, a mobile number — which is
 * why `AssistLead` is a set of optional fields rather than a reference.
 */

/** How the visitor is talking to us. Fixed for the life of a session. */
export const ASSIST_CHANNELS = ['chat', 'voice-note', 'call'] as const;
export type AssistChannel = (typeof ASSIST_CHANNELS)[number];

/**
 * Languages the assistant will speak. Mirrors the two the site itself offers.
 * A visitor may send audio in something else entirely; speech-to-text reports
 * what it heard, and anything outside this list is answered in English with the
 * detected language recorded on the turn, so we can see whether a third
 * language is worth adding.
 */
export const ASSIST_LANGS = ['hi', 'en'] as const;
export type AssistLang = (typeof ASSIST_LANGS)[number];

/**
 * The lifecycle of one conversation.
 *
 * `active` → the visitor is still here. `ended` → they left, or a guard closed
 * it. `escalated` → they asked for a person and we owe them a call back. The
 * distinction matters because `escalated` is the only state that puts a row in
 * front of the team as work.
 */
export const ASSIST_SESSION_STATUSES = ['active', 'ended', 'escalated'] as const;
export type AssistSessionStatus = (typeof ASSIST_SESSION_STATUSES)[number];

/** Why a session stopped. Recorded so the guards can be tuned against reality. */
export const ASSIST_END_REASONS = [
  'visitor-left',
  'inactivity',
  'max-duration',
  'max-turns',
  'speech-budget',
  'abuse',
  'blocked',
  'error',
  'capacity',
  'shutdown',
] as const;
export type AssistEndReason = (typeof ASSIST_END_REASONS)[number];

/**
 * What the classifier decided the visitor was asking for, BEFORE any retrieval
 * happens. The first four are answered; the rest get a template and never reach
 * the knowledge base or the answering model.
 */
export const ASSIST_INTENTS = [
  'compliance_question',
  'service_question',
  'company_info',
  'contact_request',
  'greeting',
  'pricing',
  'internal_probe',
  'off_topic',
  'abusive',
  'injection',
] as const;
export type AssistIntent = (typeof ASSIST_INTENTS)[number];

/**
 * Intents whose answer must be backed by a retrieved passage, or not given.
 *
 * ONLY compliance questions. The rule exists because a dealer will act on a
 * guideline answer and find out months later, at an inspection, that it was
 * wrong — so for those, no answer beats a plausible one.
 *
 * It must NOT be applied more widely, and doing so is not a hypothetical: it was
 * measured on 2026-08-22 with the real corpus, and "Who are you?", "Hello",
 * "नमस्ते" and "Can someone call me please" ALL came back with "I don't have
 * that written down anywhere". Those answers do not live in a retrieved passage,
 * they live in the company-facts block that is in every prompt, and holding them
 * to a retrieval score refuses the four things a first-time visitor is most
 * likely to say.
 */
export const ASSIST_GROUNDING_REQUIRED_INTENTS = [
  'compliance_question',
] as const satisfies readonly AssistIntent[];

/**
 * Intents answered without going near the knowledge base at all.
 *
 * A greeting and "please call me" need no document. Skipping retrieval for them
 * is both the better answer and the cheaper one: no embedding call, no search.
 */
export const ASSIST_NO_RETRIEVAL_INTENTS = [
  'greeting',
  'contact_request',
] as const satisfies readonly AssistIntent[];

/** The intents that are allowed to reach retrieval and generation. */
export const ASSIST_ANSWERABLE_INTENTS = [
  'compliance_question',
  'service_question',
  'company_info',
  'contact_request',
  'greeting',
  // Pricing was refused outright until 2026-08-22. It is answered now: a dealer
  // asking what it costs is the most qualified visitor on the site, and
  // stonewalling them was losing the sale. What may be SAID is still bounded —
  // the output guard permits only the figures MDG actually publishes, so the
  // assistant can quote the price and cannot invent one.
  'pricing',
] as const satisfies readonly AssistIntent[];

/**
 * Which guard stopped a turn, when one did.
 *
 * `rules-in` / `rules-out` are the cheap regex passes; `classifier` is the model
 * that reads the question; `ungrounded` means retrieval found nothing close
 * enough to answer from; `leak` / `pricing` / `prompt-echo` are the scans on the
 * generated text.
 */
export const ASSIST_GUARD_STAGES = [
  'rules-in',
  'classifier',
  'ungrounded',
  'rules-out',
  'leak',
  'pricing',
  'prompt-echo',
  'no-citation',
] as const;
export type AssistGuardStage = (typeof ASSIST_GUARD_STAGES)[number];

/** Who produced a turn. */
export const ASSIST_TURN_ROLES = ['visitor', 'assistant', 'system'] as const;
export type AssistTurnRole = (typeof ASSIST_TURN_ROLES)[number];

/**
 * Why a session was flagged for a human to look at.
 *
 * Flags are advisory and computed; they never block anyone by themselves. A
 * super-admin blocks a fingerprint explicitly, and that is the only thing that
 * turns anybody away.
 */
export const ASSIST_FLAG_KINDS = [
  'repeat-fingerprint',
  'drive-by',
  'duplicate-opening',
  'abusive',
  'bad-mobile',
  'guard-hits',
] as const;
export type AssistFlagKind = (typeof ASSIST_FLAG_KINDS)[number];

/** What a super-admin has done about an escalated session. */
export const ASSIST_FOLLOWUP_STATUSES = ['new', 'contacted', 'closed'] as const;
export type AssistFollowupStatus = (typeof ASSIST_FOLLOWUP_STATUSES)[number];

/**
 * The name, place and mobile the visitor volunteered.
 *
 * All three are optional and stay optional. A visitor who only wants to know
 * what MDG is should be able to find out without handing over a phone number,
 * and a lead with a name and no number is still worth having in front of the
 * team.
 *
 * `mobileConfirmed` is set only after the assistant has read the number back and
 * the visitor has agreed it is right. An escalation is not accepted without it,
 * because a callback to a misheard number is worse than no callback.
 */
export interface AssistLead {
  name?: string;
  place?: string;
  /** Ten digits, Indian mobile series. Stored plain — a callback needs it — and redacted in every log line. */
  mobile?: string;
  mobileConfirmed: boolean;
  capturedAt?: string;
}

/** One retrieved passage, as it was scored for a particular question. */
export interface AssistCitation {
  chunkId: string;
  docId: string;
  section: string;
  sectionTitle: string;
  pageFrom: number;
  pageTo: number;
  score: number;
}

/**
 * One thing that was said, by either side.
 *
 * `audioKey` is present when the turn was spoken — the visitor's recording, or
 * the assistant's synthesised reply. It is an S3 key, never a URL: URLs expire,
 * and a transcript that outlives its links is useless.
 */
export interface AssistTurn {
  seq: number;
  role: AssistTurnRole;
  text: string;
  lang: AssistLang;
  at: string;
  /** Set when the turn was spoken. Relative to the bucket, e.g. `assist/calls/<id>/00003-user.webm`. */
  audioKey?: string;
  audioMs?: number;
  /** Visitor turns only: what the classifier made of it. */
  intent?: AssistIntent;
  /** Assistant turns only: what the answer was actually built from. */
  citations?: AssistCitation[];
  /** Set when a guard replaced what would otherwise have been said. */
  guardStage?: AssistGuardStage;
  guardNote?: string;
}

/**
 * Per-turn debugging detail, recorded only while ASSIST_TRACE is on.
 *
 * This exists to make the first weeks debuggable and is expected to be switched
 * off once the thing is boring. It holds a HASH of the prompt, never the prompt
 * itself — the prompt is the guardrail, and a guardrail readable from the admin
 * UI is one screenshot away from being public.
 */
export interface AssistTurnTrace {
  seq: number;
  promptHash: string;
  chatModel: string;
  guardModel: string;
  retrieved: Array<{ chunkId: string; score: number }>;
  rulesHit: string[];
  timings: {
    sttMs?: number;
    embedMs?: number;
    searchMs?: number;
    llmMs?: number;
    ttsMs?: number;
    totalMs: number;
  };
  tokensIn?: number;
  tokensOut?: number;
}

/** What one session cost us, in paise, so the daily cap has something to read. */
export interface AssistCost {
  sttSeconds: number;
  ttsChars: number;
  llmTokensIn: number;
  llmTokensOut: number;
  embedTokens: number;
  estPaise: number;
}

/**
 * The bill, split by who sent it.
 *
 * Derived from the counters above and the rate table — nothing extra is stored,
 * so an old session splits correctly too and a corrected rate re-splits the
 * whole history.
 *
 * Worth separating because the two behave nothing alike. Google is charged per
 * token and is a rounding error; ElevenLabs is charged per character SPOKEN and
 * is almost the entire bill. When the daily cap trips, this is the number that
 * says whether to shorten the answers or turn speech off.
 */
export interface AssistCostSplit {
  /** Gemini generation plus embeddings, on Vertex AI. */
  vertexPaise: number;
  /** Speech in (transcription) and speech out (the spoken reply). */
  voicePaise: number;
  totalPaise: number;
}

/** The ordered recording of a call: one object per utterance, in sequence. */
export interface AssistRecordingSegment {
  seq: number;
  role: AssistTurnRole;
  key: string;
  contentType: string;
  ms: number;
}

/** A flag raised on a session by the spam pass. */
export interface AssistFlag {
  kind: AssistFlagKind;
  detail: string;
  at: string;
}

/** A session as a super-admin sees it in the list. */
export interface AssistSessionSummary {
  id: string;
  channel: AssistChannel;
  lang: AssistLang;
  status: AssistSessionStatus;
  endReason?: AssistEndReason;
  startedAt: string;
  endedAt?: string;
  durationMs: number;
  turnCount: number;
  lead: AssistLead;
  flags: AssistFlag[];
  followupStatus: AssistFollowupStatus;
  /** First thing the visitor said, trimmed — the list is scanned, not read. */
  opening: string;
  blocked: boolean;
  estPaise: number;
  /** Same total as `estPaise`, split by vendor. */
  costSplit: AssistCostSplit;
}

/** One recording segment with a signed URL attached, for the admin player. */
export interface AssistRecordingSegmentView extends AssistRecordingSegment {
  url?: string;
}

/** A session opened up: the whole transcript, the recording, the trace. */
export interface AssistSessionDetail extends AssistSessionSummary {
  turns: AssistTurn[];
  recording: AssistRecordingSegmentView[];
  cost: AssistCost;
  trace: AssistTurnTrace[];
  /** Truncated user agent, and the /24 the visitor came from. Never the full address. */
  userAgent?: string;
  ipPrefix?: string;
  fingerprint: string;
  followupNote?: string;
}

/**
 * A blocked visitor.
 *
 * Keyed by the same fingerprint the flags are computed on — a hash of the mobile
 * when there is one, otherwise a hash of address and user agent. The raw values
 * are never stored, so a block cannot be reversed into a phone number.
 */
export interface AssistBlockView {
  id: string;
  fingerprint: string;
  /** What kind of thing was hashed, so the admin knows how wide the block reaches. */
  basis: 'mobile' | 'network';
  reason: string;
  /** A partly-masked hint (e.g. `98•••••210`) so a block is recognisable without exposing the number. */
  hint: string;
  createdAt: string;
  createdByEmail?: string;
  expiresAt?: string;
}

/** A day's usage, for the budget cap and the admin usage tab. */
export interface AssistUsageDayView {
  /** `YYYY-MM-DD` in Asia/Kolkata. */
  date: string;
  sessions: number;
  calls: number;
  turns: number;
  escalations: number;
  leads: number;
  sttSeconds: number;
  ttsChars: number;
  llmTokensIn: number;
  llmTokensOut: number;
  estPaise: number;
  /** Same total as `estPaise`, split by vendor. */
  costSplit: AssistCostSplit;
}

/** What the widget is told before anyone types anything. */
export interface AssistPublicConfig {
  enabled: boolean;
  /** False when the daily budget is spent or the kill switch is off — the widget offers a callback instead. */
  callEnabled: boolean;
  /** Free slots right now, so the Call button can say "all lines busy" before it is pressed. */
  callSlotsFree: number;
  langs: AssistLang[];
  maxVoiceNoteMs: number;
  maxCallMs: number;
  /** The line the visitor must be shown before a call starts. */
  recordingNotice: Record<AssistLang, string>;
  /**
   * True when the widget may ask for a live-transcript token, so a visitor
   * sees their words appear while they are still speaking. It is a nicety on
   * top of the voice note, never a replacement: when this is false, or the
   * token is refused, or the socket dies mid-sentence, the recording is still
   * made and still answered exactly as before.
   */
  liveTranscript: boolean;
}

/**
 * A short-lived key for one live transcription, minted by the server.
 *
 * Browsers cannot set headers on a WebSocket, so the vendor's own API key
 * could only reach them in a query string. It never does: this token is
 * single-use, expires in minutes, and buys one transcription.
 */
export interface AssistLiveTranscriptToken {
  token: string;
  /** WebSocket URL, already carrying the model and audio format. */
  url: string;
  expiresInSec: number;
  /** Sample rate the socket expects, so the browser knows what to resample to. */
  sampleRate: number;
}

/** What creating a session gives the widget back. */
export interface AssistSessionCreated {
  sessionId: string;
  /** Short-lived signed token. Every later call carries it; there is no cookie. */
  token: string;
  expiresInSec: number;
  greeting: string;
  lang: AssistLang;
}

/** The answer to one turn, as the widget receives it. */
export interface AssistTurnResult {
  seq: number;
  /** What we heard, when the turn was spoken. Shown back so a misheard question is obvious. */
  heard?: string;
  text: string;
  lang: AssistLang;
  /** Signed URL for the spoken reply. Absent for a typed conversation, or if speech failed. */
  audioUrl?: string;
  audioMs?: number;
  /** True when a guard answered instead of the knowledge base. The widget shows the callback offer. */
  deflected: boolean;
  /** Set when the assistant wants the visitor's details next. */
  asksFor?: 'name' | 'place' | 'mobile' | 'mobile-confirm';
  /** Turns left before the session's cap. Lets the widget warn rather than just stop. */
  turnsRemaining: number;
}

/** Live-call events, server → widget. Kept flat: these cross a WebSocket. */
export interface AssistCallState {
  sessionId: string;
  phase: 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';
  /** Milliseconds left on the 15-minute cap. */
  remainingMs: number;
  endReason?: AssistEndReason;
}
