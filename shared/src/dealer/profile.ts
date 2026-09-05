/**
 * The outlet's own paperwork — the twenty-five things about a pump that live on
 * a dealer's registration file rather than in any service's data.
 *
 * ONE CATALOG, READ BY EVERY SURFACE. The admin Info tab renders from this list,
 * the PATCH validator builds its schema from this list, and the AI first line's
 * lookup decides what a dealer may be told from this list. That is deliberate
 * and it is the point: this platform has twice shipped a fault where one screen
 * said a figure mattered while the code read another, and the cure written into
 * `authoritative-figure` shaped tests is that the catalog is the only place a
 * field is defined. Adding a row here adds it to the form, to the validator, to
 * the audit diff and to what the machine may say, in one edit.
 *
 * WHERE A VALUE ACTUALLY LIVES — `source`
 * ---------------------------------------
 * Two of these twenty-five already existed on the dealer record with their own
 * validation and their own unique index: GST and PAN. They are NOT copied here.
 * Their catalog rows carry `source: 'gst'` / `source: 'pan'`, the resolver reads
 * them from the canonical field, and the editor writes them back through the
 * same PATCH keys the rest of the admin already uses. A second copy of a GSTIN
 * is a second answer to "what is this outlet's GSTIN", and the day the two
 * disagree there is no way to tell which one a report used.
 *
 * WHAT IS DELIBERATELY NOT MAPPED
 * -------------------------------
 * `registeredMobile` is NOT `Dealer.phone`, and `registeredEmail` is NOT
 * `ownerContact.email`. The dealer record's phone is the number that signs in to
 * the app and it carries a unique index; the registered mobile is whatever
 * number the oil company holds for the outlet, and the two are routinely
 * different people. Folding them together would let a correction to a registry
 * field lock a dealer out of their own app, or collide with another outlet's
 * sign-in. Both fields carry a `hint` saying so, because an admin looking at two
 * phone numbers on one screen will otherwise assume one is a mistake.
 *
 * PLAIN DATA, NO ZOD. Validation lives in `schemas/dealer.ts`, exactly as
 * `data/documentKinds.ts` keeps its shapes out of the catalog — the schema there
 * is BUILT from this array, so the two cannot drift.
 */
import type { Dealer, DealerProfileEntry } from '../types/dealer';

/**
 * How a value is captured and rendered.
 *
 * `code` is the important one: a SAP number, a licence reference and a GSTIN are
 * transcribed character-for-character into somebody else's portal, so they are
 * shown in a monospace face that breaks anywhere — a 15-character GSTIN has no
 * break opportunity of its own and will otherwise push a card past its edge,
 * where the admin shell's `overflow-x-hidden` cuts it off. See the same note on
 * the Info tab's existing GST row.
 */
export const DEALER_PROFILE_FIELD_KINDS = [
  /** Free text — a name, a category. */
  'text',
  /** An identifier quoted verbatim elsewhere: monospace, breaks anywhere, never reformatted. */
  'code',
  /** An Indian mobile number. */
  'phone',
  'email',
  /** A calendar day, stored and compared as `YYYY-MM-DD`. */
  'date',
  /** One of a closed list — the list is in `choices`. */
  'choice',
] as const;
export type DealerProfileFieldKind = (typeof DEALER_PROFILE_FIELD_KINDS)[number];

/**
 * The cards the Info tab draws, in the order it draws them.
 *
 * Six groups rather than one twenty-five-row list, because the sheet these
 * fields came off is read a section at a time — somebody chasing a licence
 * renewal never looks at the payment terminal ids — and a flat list of
 * twenty-five rows on a phone is a scroll with no landmarks in it.
 */
export const DEALER_PROFILE_GROUPS = [
  'outlet',
  'tax',
  'licences',
  'business',
  'transport',
  'payments',
] as const;
export type DealerProfileGroup = (typeof DEALER_PROFILE_GROUPS)[number];

export const DEALER_PROFILE_GROUP_LABELS: Readonly<Record<DealerProfileGroup, string>> = {
  outlet: 'Outlet',
  tax: 'Tax and registration',
  licences: 'Licences',
  business: 'Business',
  transport: 'Transport',
  payments: 'Payments',
};

/** One row of the catalog. */
export interface DealerProfileFieldDef {
  key: string;
  /** What the admin reads. Also what the AI first line calls the field to a dealer. */
  label: string;
  group: DealerProfileGroup;
  kind: DealerProfileFieldKind;
  /**
   * Where the value is stored. `'profile'` means this dealer's `outletProfile`
   * array; anything else names the canonical `Dealer` field that already holds
   * it, and the resolver and the editor both defer to that field.
   *
   * ADDING A THIRD IS NOT A ONE-LINE CHANGE. `resolveDealerProfile` reads it,
   * `profileDraftToPatch` writes it, `dealerUpdateSchema` has to accept its own
   * PATCH key, and the route has to assign it. The union is narrow so the
   * compiler names all four the day somebody tries.
   */
  source: 'profile' | 'gst' | 'pan';
  /** Shown under the input. Use it whenever a field can be confused with another one. */
  hint?: string;
  /** Offered as a datalist. NOT a restriction — anything may still be typed. */
  suggestions?: readonly string[];
  /** A closed list. Only meaningful for `kind: 'choice'`. */
  choices?: readonly string[];
  /**
   * This field carries an expiry or validity date beside its value, and this is
   * the word for it on screen ("Expires", "Valid till"). Absent = no date.
   */
  expiryLabel?: string;
  /** Cap on the stored value, enforced by the schema built from this catalog. */
  maxLength: number;
  /**
   * May the AI first line tell the dealer this, when they ask about their own
   * outlet?
   *
   * Every one of the twenty-five is the dealer's own registration data — they
   * filed most of it themselves — so the honest default across this catalog is
   * `true`. The flag exists so that a field added later which is MDG's note
   * about a dealer rather than the dealer's own fact can be kept off the machine
   * without a schema change, and so the gate lives in the catalog rather than
   * inside a prompt. Admin-authored custom fields default the other way round;
   * see {@link DealerCustomField}.
   */
  dealerVisible: boolean;
}

/**
 * The twenty-five, in the order they appear on the sheet an oil-company dealer
 * keeps, grouped for the screen.
 *
 * SPELLINGS ARE THE TRADE'S, NOT THE SHEET'S. The source sheet reads "Wet and
 * Mgr Licence", "Vechile No", "Date Of Cammisioning". Those are typed shorthand
 * for the Weights & Measures (Legal Metrology) licence, the vehicle number and
 * the commissioning date, and the labels here are the ones a dealer or an
 * inspector would use out loud. The KEY is what code joins on and never changes;
 * a label is free to be corrected.
 */
const CATALOG = [
  /* ── Outlet ─────────────────────────────────────────────────────────── */
  {
    key: 'oilCompanyName',
    label: 'Oil company',
    group: 'outlet',
    kind: 'text',
    source: 'profile',
    suggestions: ['IOCL', 'BPCL', 'HPCL', 'Nayara', 'Shell', 'Reliance'],
    maxLength: 120,
    dealerVisible: true,
  },
  {
    key: 'automationVendorName',
    label: 'Automation vendor',
    group: 'outlet',
    kind: 'text',
    source: 'profile',
    hint: 'Who supplied the forecourt automation.',
    suggestions: ['ATOS', 'Gilbarco', 'Dover', 'Tokheim', 'Midco', 'Petrosoft'],
    maxLength: 120,
    dealerVisible: true,
  },
  {
    key: 'pumpSite',
    label: 'Site',
    group: 'outlet',
    kind: 'text',
    source: 'profile',
    maxLength: 60,
    dealerVisible: true,
  },
  {
    key: 'pumpSapCode',
    label: 'SAP code',
    group: 'outlet',
    kind: 'code',
    source: 'profile',
    /**
     * Held here, and never printed on anything the dealer is SENT. The SAP code
     * is the oil company's number for the site; report cards and printable
     * headers were deliberately stripped of it when the dealer code became the
     * whole identity, and that stays true — a test in `dsr-report/cards.test.ts`
     * fails if it renders. Answering a dealer who asks "what is our SAP code"
     * with their own SAP code is a different act from stamping it on every
     * report they receive.
     */
    hint: 'The oil company’s number for this site. Never printed on a report.',
    maxLength: 40,
    dealerVisible: true,
  },
  {
    key: 'pumpName',
    label: 'Pump name',
    group: 'outlet',
    kind: 'text',
    source: 'profile',
    /**
     * A dealer is identified by its CODE — `15E` — and the free-text name was
     * removed from the record for that reason. This is registration data on a
     * file, not an identity: nothing sorts, searches, labels or headers by it,
     * and nothing should start.
     */
    hint: 'Registration name only. The dealer is identified everywhere by their code.',
    maxLength: 200,
    dealerVisible: true,
  },
  {
    key: 'pumpVendorCode',
    label: 'Vendor code',
    group: 'outlet',
    kind: 'code',
    source: 'profile',
    maxLength: 40,
    dealerVisible: true,
  },
  {
    key: 'pumpUniqueCode',
    label: 'Unique code',
    group: 'outlet',
    kind: 'code',
    source: 'profile',
    maxLength: 40,
    dealerVisible: true,
  },
  /* ── Tax and registration ───────────────────────────────────────────── */
  {
    key: 'gst',
    label: 'GST number',
    group: 'tax',
    kind: 'code',
    source: 'gst',
    maxLength: 15,
    dealerVisible: true,
  },
  {
    key: 'pan',
    label: 'PAN',
    group: 'tax',
    kind: 'code',
    source: 'pan',
    maxLength: 10,
    dealerVisible: true,
  },
  {
    key: 'registeredMobile',
    label: 'Registered mobile',
    group: 'tax',
    kind: 'phone',
    source: 'profile',
    hint: 'The number on the oil company’s registration. Not the app sign-in number.',
    maxLength: 20,
    dealerVisible: true,
  },
  {
    key: 'registeredEmail',
    label: 'Registered email',
    group: 'tax',
    kind: 'email',
    source: 'profile',
    hint: 'The address on the registration, which may not be the owner’s own.',
    maxLength: 160,
    dealerVisible: true,
  },
  /* ── Licences ───────────────────────────────────────────────────────── */
  {
    key: 'explosiveLicenceNo',
    label: 'Explosive licence',
    group: 'licences',
    kind: 'code',
    source: 'profile',
    hint: 'The PESO / CCOE licence for storing petroleum.',
    expiryLabel: 'Expires',
    maxLength: 80,
    dealerVisible: true,
  },
  {
    key: 'dtoTradeLicenceNo',
    label: 'DTO trade licence',
    group: 'licences',
    kind: 'code',
    source: 'profile',
    expiryLabel: 'Expires',
    maxLength: 80,
    dealerVisible: true,
  },
  {
    key: 'wmLicenceNo',
    label: 'Weights & Measures licence',
    group: 'licences',
    kind: 'code',
    source: 'profile',
    hint: 'Legal Metrology — the sheet calls it the W&M licence.',
    expiryLabel: 'Valid till',
    maxLength: 80,
    dealerVisible: true,
  },
  {
    key: 'wmRegisteredMobile',
    label: 'W&M registered mobile',
    group: 'licences',
    kind: 'phone',
    source: 'profile',
    hint: 'The number registered against the Weights & Measures licence.',
    maxLength: 20,
    dealerVisible: true,
  },
  /* ── Business ───────────────────────────────────────────────────────── */
  {
    key: 'commissioningDate',
    label: 'Commissioned on',
    group: 'business',
    kind: 'date',
    source: 'profile',
    hint: 'The day the outlet started selling.',
    maxLength: 10,
    dealerVisible: true,
  },
  {
    key: 'ownership',
    label: 'Ownership',
    group: 'business',
    kind: 'choice',
    source: 'profile',
    choices: ['Proprietor', 'Partnership', 'Private limited', 'LLP'],
    maxLength: 40,
    dealerVisible: true,
  },
  {
    key: 'category',
    label: 'Category',
    group: 'business',
    kind: 'text',
    source: 'profile',
    hint: 'The dealership category as the oil company records it.',
    maxLength: 80,
    dealerVisible: true,
  },
  {
    key: 'agreementDate',
    label: 'Agreement date',
    group: 'business',
    kind: 'date',
    source: 'profile',
    maxLength: 10,
    dealerVisible: true,
  },
  /* ── Transport ──────────────────────────────────────────────────────── */
  {
    key: 'isTransporter',
    label: 'Transporter',
    group: 'transport',
    kind: 'choice',
    source: 'profile',
    choices: ['Yes', 'No'],
    hint: 'Whether this dealer also runs their own tank truck.',
    maxLength: 8,
    dealerVisible: true,
  },
  {
    key: 'vehicleNo',
    label: 'Vehicle number',
    group: 'transport',
    kind: 'code',
    source: 'profile',
    maxLength: 40,
    dealerVisible: true,
  },
  {
    key: 'transporterVendorCode',
    label: 'Transporter vendor code',
    group: 'transport',
    kind: 'code',
    source: 'profile',
    maxLength: 40,
    dealerVisible: true,
  },
  /* ── Payments ───────────────────────────────────────────────────────── */
  {
    key: 'itpsMid',
    label: 'ITPS merchant ID',
    group: 'payments',
    kind: 'code',
    source: 'profile',
    maxLength: 60,
    dealerVisible: true,
  },
  {
    key: 'itpsTid',
    label: 'ITPS terminal ID',
    group: 'payments',
    kind: 'code',
    source: 'profile',
    maxLength: 60,
    dealerVisible: true,
  },
  {
    key: 'xtraPowerMerchantId',
    label: 'XtraPower merchant ID',
    group: 'payments',
    kind: 'code',
    source: 'profile',
    maxLength: 60,
    dealerVisible: true,
  },
] as const satisfies readonly DealerProfileFieldDef[];

/** Every catalog key, as a union — so a typo in a lookup is a compile error. */
export type DealerProfileFieldKey = (typeof CATALOG)[number]['key'];

/**
 * The catalog, widened to the interface.
 *
 * `CATALOG` above is `as const` only so the key union can be read off it. Every
 * consumer iterates THIS one: on the literal type an optional property that no
 * row happens to set — `expiryLabel` on a text field — is not merely undefined,
 * it is absent from the type, and `def.expiryLabel` fails to compile.
 */
export const DEALER_PROFILE_FIELDS: readonly DealerProfileFieldDef[] = CATALOG;

export const DEALER_PROFILE_FIELD_KEYS: readonly DealerProfileFieldKey[] = CATALOG.map(
  (f) => f.key,
);

const FIELD_BY_KEY: ReadonlyMap<string, DealerProfileFieldDef> = new Map(
  DEALER_PROFILE_FIELDS.map((f) => [f.key, f]),
);

/** The catalog row for a key, or `undefined` if the key is a custom one. */
export function dealerProfileField(key: string): DealerProfileFieldDef | undefined {
  return FIELD_BY_KEY.get(key);
}

export function isDealerProfileFieldKey(key: string): key is DealerProfileFieldKey {
  return FIELD_BY_KEY.has(key);
}

/**
 * How many admin-authored key/value pairs one dealer may carry.
 *
 * A cap rather than none, for the same reason `complianceDocs` has one: the
 * whole array is written back on every save and read back on every dealer fetch,
 * and an unbounded list is a way to make one screen slow for everybody.
 */
export const DEALER_CUSTOM_FIELDS_MAX = 40;

/** Cap on an admin-authored value. Longer than a catalog field: it is free text. */
export const DEALER_CUSTOM_FIELD_VALUE_MAX = 500;
/** Cap on an admin-authored label. */
export const DEALER_CUSTOM_FIELD_LABEL_MAX = 60;

/* ────────────────────────────────────────────────────────────────────────
 * Expiry
 * ──────────────────────────────────────────────────────────────────────── */

export const DEALER_PROFILE_EXPIRY_STATES = ['expired', 'expiring', 'valid'] as const;
export type DealerProfileExpiryState = (typeof DEALER_PROFILE_EXPIRY_STATES)[number];

/**
 * How many days ahead counts as "expiring soon".
 *
 * Sixty, because a PESO licence renewal is a district-office errand with a
 * queue in it, and a fortnight's warning is a warning nobody can act on.
 */
export const DEALER_PROFILE_EXPIRY_SOON_DAYS = 60;

/**
 * Whether a stored expiry has passed, is close, or is fine — as of a day the
 * caller supplies.
 *
 * PURE, and the day is an argument rather than a clock read, for the reason the
 * fence gives for the same choice: the combinations are what this gets wrong,
 * not the plumbing, and a pure function can carry its boundary cases in tests
 * that need no database and no fake timers. Both arguments are `YYYY-MM-DD`
 * calendar days, never `Date` objects — an expiry is a day on a certificate, and
 * putting it through a timezone is how a licence expires a day early in Assam.
 */
export function dealerProfileExpiryState(
  expiresOn: string | undefined,
  today: string,
): DealerProfileExpiryState | undefined {
  if (!expiresOn || !today) return undefined;
  const days = daysBetweenIsoDays(today, expiresOn);
  // Unreadable is not "fine". No verdict at all, so the screen says nothing and
  // the machine has nothing to quote.
  if (Number.isNaN(days)) return undefined;
  if (days < 0) return 'expired';
  return days <= DEALER_PROFILE_EXPIRY_SOON_DAYS ? 'expiring' : 'valid';
}

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier.
 *
 * `NaN` for a date that will not parse, and the caller turns that into NO STATE
 * rather than a good one. It used to return `+Infinity`, which read as "more
 * than sixty days away" and painted a green "Valid" badge on a licence whose
 * expiry we cannot even read. A compliance verdict must fail closed.
 */
function daysBetweenIsoDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * A profile date as a dealer reads it — AND IT ALWAYS CARRIES THE YEAR.
 *
 * NOT `documentPeriodLabel`. That formatter is right for what it names and
 * wrong here, and the difference is the whole reason this exists: it prints a
 * day as `{ day: 'numeric', month: 'short' }` with NO YEAR, because a document
 * period is always the last few weeks and the year would be noise. These dates
 * are not that. A trade licence valid until 31 December 2027 rendered as
 * "31 Dec" reads as this year to anybody, and a licence that lapsed on 31 August
 * 2026 rendered as "31 Aug" reads as one that has not lapsed yet — which is the
 * single most damaging thing this feature could tell a dealer.
 *
 * Everything else follows the same dialect deliberately: formatted in UTC
 * against a MIDDAY anchor so no time zone can shift the printed day, `hi-IN` /
 * `en-IN`, full month name in Hindi and short in English, and wrapped in
 * try/catch because a stripped-down Android WebView can throw on a locale whose
 * ICU data it does not carry. A date that prints as its raw key is survivable;
 * a screen that does not render is not.
 */
export function dealerProfileDateLabel(isoDay: string, lang: 'hi' | 'en'): string {
  const t = Date.parse(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(t)) return isoDay;
  try {
    return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: lang === 'hi' ? 'long' : 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(t));
  } catch {
    return isoDay;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Resolution — one dealer's profile, assembled
 * ──────────────────────────────────────────────────────────────────────── */

/** One field as every surface reads it: catalog metadata joined to this dealer's value. */
export interface ResolvedDealerProfileField {
  key: string;
  label: string;
  /**
   * `'custom'` for an admin-authored pair, which belongs to no catalog group.
   *
   * Saying so rather than picking a group and hoping nobody reads it: a custom
   * row given `'business'` would render under Business the day somebody buckets
   * by this field instead of by `custom`, and it would look deliberate.
   */
  group: DealerProfileGroup | 'custom';
  kind: DealerProfileFieldKind;
  /** Empty string when nothing is recorded. Callers decide how to say "not recorded". */
  value: string;
  expiresOn?: string;
  expiryLabel?: string;
  expiryState?: DealerProfileExpiryState;
  hint?: string;
  choices?: readonly string[];
  suggestions?: readonly string[];
  maxLength: number;
  dealerVisible: boolean;
  /** `true` for an admin-authored pair, `false` for one of the twenty-five. */
  custom: boolean;
}

export interface ResolvedDealerProfileGroup {
  group: DealerProfileGroup | 'custom';
  label: string;
  fields: ResolvedDealerProfileField[];
}

export interface ResolveDealerProfileOptions {
  /**
   * The IST calendar day, `YYYY-MM-DD`, used to work out expiry state. Omit and
   * no row carries an `expiryState` — which is the right answer for a caller
   * that has no clock rather than a guess made with one.
   */
  today?: string;
  /**
   * Keep rows with no value. The admin form wants them (it is a form); the AI
   * lookup does not (a fact with no value is a fact the writer will reach for).
   * Defaults to `true`.
   */
  includeEmpty?: boolean;
  /** Keep only what a dealer may be told. Defaults to `false` — the admin view. */
  dealerVisibleOnly?: boolean;
}

type ProfileSource = Pick<Dealer, 'gst' | 'pan' | 'outletProfile' | 'customFields'>;

/**
 * This dealer's outlet profile, catalog order first and admin-added pairs after.
 *
 * The ONE read path. The Info tab, the editor, the AI lookup and any future
 * export all go through here, so "what is this outlet's W&M licence" has exactly
 * one answer no matter who is asking.
 */
export function resolveDealerProfile(
  dealer: ProfileSource,
  options: ResolveDealerProfileOptions = {},
): ResolvedDealerProfileField[] {
  const { today, includeEmpty = true, dealerVisibleOnly = false } = options;
  const stored = new Map<string, { value: string; expiresOn?: string }>();
  for (const entry of dealer.outletProfile ?? []) {
    stored.set(entry.key, { value: entry.value, expiresOn: entry.expiresOn });
  }

  const rows: ResolvedDealerProfileField[] = [];

  for (const def of DEALER_PROFILE_FIELDS) {
    if (dealerVisibleOnly && !def.dealerVisible) continue;
    const entry = def.source === 'profile' ? stored.get(def.key) : undefined;
    const value =
      def.source === 'profile'
        ? (entry?.value ?? '')
        : def.source === 'gst'
          ? (dealer.gst ?? '')
          : (dealer.pan ?? '');
    if (!value && !includeEmpty) continue;
    // A canonical-sourced field has nowhere to keep an expiry and never asks for
    // one, so `expiresOn` is read only off the profile entry.
    const expiresOn = def.expiryLabel ? entry?.expiresOn : undefined;
    rows.push({
      key: def.key,
      label: def.label,
      group: def.group,
      kind: def.kind,
      value,
      expiresOn,
      expiryLabel: def.expiryLabel,
      expiryState: dealerProfileExpiryState(expiresOn, today ?? ''),
      hint: def.hint,
      choices: def.choices,
      suggestions: def.suggestions,
      maxLength: def.maxLength,
      dealerVisible: def.dealerVisible,
      custom: false,
    });
  }

  for (const entry of dealer.customFields ?? []) {
    if (dealerVisibleOnly && !entry.dealerVisible) continue;
    if (!entry.value && !includeEmpty) continue;
    rows.push({
      key: entry.key,
      label: entry.label,
      group: 'custom',
      kind: 'text',
      value: entry.value,
      expiresOn: entry.expiresOn,
      expiryLabel: entry.expiresOn ? 'Expires' : undefined,
      expiryState: dealerProfileExpiryState(entry.expiresOn, today ?? ''),
      maxLength: DEALER_CUSTOM_FIELD_VALUE_MAX,
      dealerVisible: entry.dealerVisible,
      custom: true,
    });
  }

  return rows;
}

/** The same rows, bucketed into the cards the Info tab draws. Empty groups are dropped. */
export function groupDealerProfile(
  fields: readonly ResolvedDealerProfileField[],
): ResolvedDealerProfileGroup[] {
  const out: ResolvedDealerProfileGroup[] = [];
  for (const group of DEALER_PROFILE_GROUPS) {
    const rows = fields.filter((f) => !f.custom && f.group === group);
    if (rows.length > 0) {
      out.push({ group, label: DEALER_PROFILE_GROUP_LABELS[group], fields: rows });
    }
  }
  const custom = fields.filter((f) => f.custom);
  if (custom.length > 0) {
    out.push({ group: 'custom', label: 'Other details', fields: custom });
  }
  return out;
}

/**
 * Turn an admin's typed label into the key stored beside it.
 *
 * A key rather than the label alone, because the label is editable and the key
 * is what an audit diff and a later import join on: renaming "Fire NOC" to "Fire
 * NOC (2026)" must read as one field changed, not one deleted and one added.
 * Lower-case, dot-free and space-free so it can never collide with the shape of
 * a catalog key or a Mongo field path.
 */
export function dealerCustomFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, DEALER_CUSTOM_FIELD_LABEL_MAX);
  // A label of nothing but punctuation slugs to an empty string, which is not a
  // key. It is returned as-is and refused by `dealerCustomFieldSchema`, so the
  // one place that decides what a valid pair looks like stays the schema.
  return slug;
}

/* ────────────────────────────────────────────────────────────────────────
 * The editor's shape, and the conversion back
 * ──────────────────────────────────────────────────────────────────────── */

/** One row as the admin form holds it while it is being typed into. */
export interface DealerProfileDraftRow {
  value: string;
  expiresOn?: string;
}

/**
 * What a PATCH carries after the editor is saved.
 *
 * `gst` and `pan` are split back out of the draft and sent as their own keys,
 * because that is where they live. `null` means the admin emptied the box and
 * wants the field gone — distinct from `undefined`, which every other PATCH
 * field uses to mean "leave this alone".
 */
export interface DealerProfilePatch {
  outletProfile: DealerProfileEntry[];
  /**
   * A string sets it, `null` CLEARS it, `undefined` leaves it alone.
   *
   * Three states and not two, because the draft may not carry the key at all —
   * a caller building a partial draft, or one restored from a bundle that
   * predates the field. Collapsing "no box for this" into "the box was emptied"
   * would let a partial save wipe a GSTIN nobody touched, and `undefined` is
   * already what every other PATCH key means by "not mentioned".
   */
  gst?: string | null;
  pan?: string | null;
}

/**
 * Turn the editor's record of typed boxes into the arrays the API stores.
 *
 * PURE, AND IN SHARED, because `mdg-admin` has no test runner at all: any rule
 * that can be got wrong belongs somewhere it can carry tests. The rules are all
 * here, and there are only four —
 *
 *  1. Values are trimmed, and an empty one is DROPPED rather than stored blank.
 *     A stored empty string is a third state between "never filled in" and
 *     "cleared", and every reader would then have to know about it.
 *  2. A field whose value is gone loses its expiry with it. An expiry date
 *     hanging on after the licence number it belonged to has been cleared is a
 *     row that reads as an expiring licence nobody holds.
 *  3. `gst` and `pan` come out separately, as `null` when emptied.
 *  4. A key that is not in the catalog is discarded. The editor draws its boxes
 *     FROM the catalog so it cannot produce one, but a draft restored from an
 *     older bundle after a field was renamed could.
 */
export function profileDraftToPatch(
  draft: Readonly<Record<string, DealerProfileDraftRow | undefined>>,
): DealerProfilePatch {
  const outletProfile: DealerProfileEntry[] = [];
  const canonical: { gst?: string | null; pan?: string | null } = {};

  for (const def of DEALER_PROFILE_FIELDS) {
    const row = draft[def.key];
    const value = (row?.value ?? '').trim();
    if (def.source !== 'profile') {
      // Absent from the draft entirely = not mentioned. Present and empty =
      // cleared. See `DealerProfilePatch`.
      if (Object.prototype.hasOwnProperty.call(draft, def.key)) {
        canonical[def.source] = value || null;
      }
      continue;
    }
    if (!value) continue;
    const expiresOn = def.expiryLabel ? (row?.expiresOn ?? '').trim() : '';
    outletProfile.push(expiresOn ? { key: def.key, value, expiresOn } : { key: def.key, value });
  }

  return { outletProfile, ...canonical };
}

/** The stored profile, back in the shape the editor's boxes read from. */
export function profileToDraft(
  dealer: ProfileSource,
): Record<string, DealerProfileDraftRow> {
  const draft: Record<string, DealerProfileDraftRow> = {};
  for (const field of resolveDealerProfile(dealer)) {
    if (field.custom) continue;
    draft[field.key] = { value: field.value, expiresOn: field.expiresOn ?? '' };
  }
  return draft;
}
