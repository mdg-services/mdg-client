import type { OutletChoice, OutletsView, ReportData, ReportDetail } from '@dk/shared/types';

/**
 * Which pump a report is about, for a person who has more than one (ADR 0056 §4).
 *
 * A person with two pumps has one login per pump. A push or a link made for the OTHER pump's login
 * can reach the app while this pump's login is the one signed in. Showing that report's numbers as
 * if they were this pump's would be a wrong answer with a straight face, so the overlay says whose
 * report it is and offers the existing pump switch.
 *
 * Three sources can name the pump, in the order they are trusted: the report's own `dealerId` (when
 * the server sends one), the code on its snapshot, and the code the link carried (`?outlet=12E`).
 * A person with one pump never gets a banner and never sees a code in the header.
 */

/** The pump code, compared the way a person reads it: case and spaces do not matter. */
export function normalizePumpCode(code: string | null | undefined): string {
  return (code ?? '').replace(/\s+/g, '').toUpperCase();
}

/** The person has another pump to switch to, so the overlay names the pump it is about. */
export function hasSeveralPumps(view: OutletsView | undefined): view is OutletsView & { current: OutletChoice } {
  return !!view?.current && view.outlets.length > 0;
}

/** What the server or the snapshot says about the pump, whichever of the three is there. */
export interface PumpFacts {
  /** `ReportDetail.dealerId`, when the server sends it. */
  dealerId?: string | null;
  /** The code on the snapshot or the server's detail. */
  code?: string | null;
}

/** Reads the pump facts out of a report as the app holds it. Tolerant of fields an older server does not send. */
export function pumpFactsOf(detail: ReportDetail | undefined, data: ReportData | undefined, hint?: string): PumpFacts {
  const loose = (detail ?? {}) as { dealerId?: unknown; outletCode?: unknown };
  const snapCode = data && 'outletCode' in data ? data.outletCode : undefined;
  const code =
    (typeof loose.outletCode === 'string' && loose.outletCode) ||
    (typeof snapCode === 'string' && snapCode) ||
    (hint ? hint : undefined);
  return {
    ...(typeof loose.dealerId === 'string' && loose.dealerId ? { dealerId: loose.dealerId } : {}),
    ...(code ? { code } : {}),
  };
}

/** The pump the person is not in, when the report is about another one. `choice` is set when the person has a login for it. */
export interface OtherPump {
  code: string;
  choice?: OutletChoice;
}

export function otherPumpOf(view: OutletsView | undefined, facts: PumpFacts): OtherPump | null {
  if (!hasSeveralPumps(view)) return null;
  const here = view.current;
  if (facts.dealerId && facts.dealerId !== here.dealerId) {
    const choice = view.outlets.find((o) => o.dealerId === facts.dealerId);
    return { code: choice?.code ?? facts.code ?? '', ...(choice ? { choice } : {}) };
  }
  if (facts.code && normalizePumpCode(facts.code) !== normalizePumpCode(here.code)) {
    const choice = view.outlets.find((o) => normalizePumpCode(o.code) === normalizePumpCode(facts.code));
    return { code: choice?.code ?? facts.code, ...(choice ? { choice } : {}) };
  }
  return null;
}

/** The code the header prints beside the report's name: the report's own, else the pump the person is in. */
export function headerPumpCode(view: OutletsView | undefined, facts: PumpFacts): string | null {
  if (!hasSeveralPumps(view)) return null;
  return facts.code?.trim() || view.current.code;
}
