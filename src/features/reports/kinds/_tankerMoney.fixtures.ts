import type {
  CreditDodData,
  FuelOrderData,
  LedgerWatchData,
  ReportDetail,
  ReportKind,
  TankerDensityData,
  TtAckData,
} from '@dk/shared/types';

/** A minimal report as the server sends it, for the overlay tests of the tanker and money kinds. */
export function reportOf(kind: ReportKind): ReportDetail {
  return {
    id: 'm1',
    kind,
    status: 'ok',
    sentAt: '2026-11-24T08:00:00.000Z',
    headline: '',
    attachments: [],
    conversationId: 'c1',
    messageId: 'm1',
    live: {},
  };
}

export function densityData(over: Partial<TankerDensityData> = {}): TankerDensityData {
  return {
    kind: 'tanker_density',
    v: 1,
    capturedAt: '2026-11-23T10:45:00.000Z',
    outletCode: '15E',
    invoiceNo: '7010045406',
    vehicleNo: 'BR09GC8009',
    vehicleKey: 'BR09GC8009',
    invoiceDate: '2026-11-23',
    invoiceTime: '16:10',
    lines: [
      { family: 'DIESEL', productKey: 'HSD', density15Raw: '820.500', quantity: 6, unit: 'KL', tankNo: 'T018' },
    ],
    droppedLines: 0,
    ...over,
  };
}

export function ttAckData(over: Partial<TtAckData> = {}): TtAckData {
  return {
    kind: 'tt_ack',
    v: 1,
    capturedAt: '2026-11-24T13:35:00.000Z',
    outletCode: '15E',
    vehicleNo: 'BR09GC8009',
    vehicleKey: 'BR09GC8009',
    ackedAt: '2026-11-24T13:35:00.000Z',
    condition: 'Excellent',
    rows: [
      {
        invoiceNo: '7010045406',
        invoiceDate: '2026-11-23',
        short: 'none',
        totalShortL: 0,
        claimShortL: 0,
        products: [{ code: 'HSD', totalShortL: 0, claimShortL: 0 }],
      },
    ],
    anyShort: false,
    ...over,
  };
}

export function fuelOrderData(over: Partial<FuelOrderData> = {}): FuelOrderData {
  return {
    kind: 'fuel_order',
    v: 1,
    event: 'tanker_assigned',
    indentId: 'ind1',
    orderNo: '4500012345',
    source: 'portal',
    stage: 'tanker_assigned',
    asOf: '2026-11-24T13:35:00.000Z',
    deliveryDay: '2026-11-25',
    lines: [{ product: 'HSD', material: 'HIGH SPEED DIESEL', kl: 12 }],
    totalKl: 12,
    ttNo: 'BR01GA1234',
    shipmentAt: '2026-11-24 15:20:00',
    ...over,
  };
}

export function creditData(over: Partial<CreditDodData> = {}): CreditDodData {
  return {
    kind: 'credit_dod',
    v: 1,
    outletCode: '15E',
    asOf: '2026-11-24',
    capturedAt: '2026-11-24T09:46:16.000Z',
    backdated: false,
    festivalKey: null,
    verdict: 'due',
    money: {
      amount: 124000,
      dueAmount: 124000,
      date: '2026-11-27',
      daysLeft: 3,
      dateIsApprox: false,
      daysIsMinimum: false,
      deadlines: null,
    },
    limit: { form: 'DOD', current: 6000000, availed: 4725310.4, available: 1274689.6, usedPct: 78.8 },
    review: { on: '2027-03-31', daysUntil: 127, lapsed: false },
    ...over,
  };
}

export function ledgerData(over: Partial<LedgerWatchData> = {}): LedgerWatchData {
  return {
    kind: 'ledger_watch',
    v: 1,
    outletCode: '15E',
    generatedAt: '2026-11-24T09:46:00.000Z',
    window: null,
    totalMovements: 2,
    totalsScope: 'shown',
    charged: 1062,
    received: 63877,
    topSeverity: 'NOTICE',
    movements: [
      {
        date: '2026-11-14',
        amount: 1062,
        direction: 'CHARGED',
        class: 'INTEREST',
        flagKind: 'OTHER_MOVEMENT',
        severity: 'NOTICE',
        title: { en: 'Interest charged on the outstanding', hi: 'बकाया पर ब्याज लगा' },
      },
      {
        date: '2026-11-09',
        amount: 63877,
        direction: 'RECEIVED',
        class: 'COMMISSION',
        flagKind: 'OTHER_MOVEMENT',
        severity: 'INFO',
        title: { en: 'Dealer commission paid', hi: 'डीलर कमीशन मिला' },
      },
    ],
    ...over,
  };
}
