import type { ComponentType } from 'react';

import { ComplaintsPanel, PermitsPanel } from './boxPanels';
import {
  renderCredit,
  renderDensity,
  renderDsr,
  renderFuelOrders,
  renderPapers,
  renderPlan,
  renderWater,
} from './dailyPanels';
import {
  renderAck,
  renderCalibration,
  renderDeclarations,
  renderDuOtp,
  renderElectrical,
  renderMockDrill,
  renderStock,
  renderSupply,
} from './filingPanels';
import type { PanelCtx, PanelOut } from './parts';

export type { PanelCtx, PanelOut } from './parts';

/**
 * One "Right now" panel per service (spec 4.3): built from three templates plus this, so seventeen
 * pages are not seventeen hand-built layouts. A renderer returns null when the reports the page holds
 * say nothing about its service yet; the page then says when MDG will send the first one.
 */
const RENDERERS: Readonly<Record<string, (ctx: PanelCtx) => PanelOut | null>> = {
  'dsr-report': renderDsr,
  'credit-dod-monitoring': renderCredit,
  'water-ingress-testing': renderWater,
  'load-planner': renderPlan,
  'fuel-indent': renderFuelOrders,
  'tt-density': renderDensity,
  'tanker-documents': renderPapers,
  'tt-acknowledgement': renderAck,
  'du-otp-acknowledgement': renderDuOtp,
  'dealer-declarations': renderDeclarations,
  'mock-drill': renderMockDrill,
  'electrical-audit': renderElectrical,
  'calibration-claim': renderCalibration,
  'ro-supply-status': renderSupply,
  'stock-check': renderStock,
};

/** The two services that work in chat boxes: their panels read their own routes. */
const BOX_PANELS: Readonly<Record<string, ComponentType<{ ctx: PanelCtx }>>> = {
  'maintenance-complaints': ComplaintsPanel,
  'work-permits': PermitsPanel,
};

/** The panel of a service, or null when it has nothing to show yet (or no panel). */
export function panelFor(serviceId: string, ctx: PanelCtx): PanelOut | null {
  const Box = BOX_PANELS[serviceId];
  if (Box) return { content: <Box ctx={ctx} /> };
  return RENDERERS[serviceId]?.(ctx) ?? null;
}
