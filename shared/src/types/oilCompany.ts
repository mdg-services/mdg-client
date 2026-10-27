/**
 * The oil company a petrol pump sells for: Indian Oil, Bharat Petroleum (BPCL) or
 * Hindustan Petroleum (HPCL).
 *
 * Every MDG service was built on Indian Oil's two portals, SDMS and IRAS. BPCL and
 * HPCL outlets are welcome too, but for now MDG's team works their company portal
 * BY HAND: the onboarding asks such an outlet for ONE login, the company's own
 * dealer portal, and names it only by the company ("BPCL portal"), never by what
 * MDG will do with it. Nothing tries that login automatically yet.
 *
 * The company is asked as the first step of the onboarding (`setup.company`). An
 * outlet with no company on record is Indian Oil: every outlet from before this
 * step was one.
 */
import type { PortalId } from './portalLogin';

export const OIL_COMPANIES = ['iocl', 'bpcl', 'hpcl'] as const;
export type OilCompanyId = (typeof OIL_COMPANIES)[number];

/** What a dealer calls each company, in both app languages. The short name is on every pump's board. */
export const OIL_COMPANY_NAMES: Readonly<
  Record<OilCompanyId, { hi: string; en: string; short: string }>
> = {
  iocl: { hi: 'इंडियन ऑयल', en: 'Indian Oil', short: 'IOCL' },
  bpcl: { hi: 'भारत पेट्रोलियम', en: 'Bharat Petroleum', short: 'BPCL' },
  hpcl: { hi: 'हिंदुस्तान पेट्रोलियम', en: 'Hindustan Petroleum', short: 'HPCL' },
};

/**
 * The portal logins the onboarding asks an outlet of each company for, in the
 * order the login box shows them. Indian Oil: SDMS then IRAS. BPCL and HPCL: the
 * company's one dealer portal.
 */
export const COMPANY_PORTALS: Readonly<Record<OilCompanyId, readonly PortalId[]>> = {
  iocl: ['sdms', 'iras'],
  bpcl: ['bpcl'],
  hpcl: ['hpcl'],
};

/** The company of an outlet with nothing on record: Indian Oil. */
export const DEFAULT_OIL_COMPANY: OilCompanyId = 'iocl';
