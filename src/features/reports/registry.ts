import type { ReportData, ReportKind } from '@dk/shared/types';

import { view as announcement } from './kinds/announcement';
import { view as calibrationClaim } from './kinds/calibration_claim';
import { view as creditDod } from './kinds/credit_dod';
import { view as declarationFiled } from './kinds/declaration_filed';
import { view as dsrSales } from './kinds/dsr_sales';
import { view as dsrVariation } from './kinds/dsr_variation';
import { view as duOtp } from './kinds/du_otp';
import { view as electricalAudit } from './kinds/electrical_audit';
import { view as fuelOrder } from './kinds/fuel_order';
import { view as kavach } from './kinds/kavach';
import { view as ledgerWatch } from './kinds/ledger_watch';
import { view as loadPlan } from './kinds/load_plan';
import { view as mockDrill } from './kinds/mock_drill';
import { view as paperExpiry } from './kinds/paper_expiry';
import { view as roSupply } from './kinds/ro_supply';
import { view as stockCheck } from './kinds/stock_check';
import { view as tankerDensity } from './kinds/tanker_density';
import { view as ttAck } from './kinds/tt_ack';
import { view as waterIngress } from './kinds/water_ingress';
import type { KindView } from './types';

/**
 * Every report kind's view (ADR 0056), keyed by kind. The `satisfies` clause makes the
 * compiler check two things at once: that all nineteen kinds are here, and that each
 * entry is the view OF that kind (its overlay takes that kind's snapshot).
 */
export const KIND_VIEWS = {
  dsr_sales: dsrSales,
  dsr_variation: dsrVariation,
  stock_check: stockCheck,
  load_plan: loadPlan,
  tanker_density: tankerDensity,
  tt_ack: ttAck,
  fuel_order: fuelOrder,
  credit_dod: creditDod,
  ledger_watch: ledgerWatch,
  calibration_claim: calibrationClaim,
  water_ingress: waterIngress,
  ro_supply: roSupply,
  du_otp: duOtp,
  declaration_filed: declarationFiled,
  mock_drill: mockDrill,
  electrical_audit: electricalAudit,
  paper_expiry: paperExpiry,
  kavach: kavach,
  announcement: announcement,
} satisfies { [K in ReportKind]: KindView<K> };

/** The view of one kind. */
export function getKindView<K extends ReportKind>(kind: K): KindView<K> {
  return KIND_VIEWS[kind] as unknown as KindView<K>;
}

/**
 * The view for a snapshot, when the caller holds a `ReportData` and not a kind it can
 * narrow. Narrowing a union through a keyed lookup is beyond the compiler, so the view
 * comes back with its kind erased; call its functions with the same `data`.
 */
export function viewOfData(data: ReportData): KindView<ReportData['kind']> {
  return KIND_VIEWS[data.kind] as unknown as KindView<ReportData['kind']>;
}
