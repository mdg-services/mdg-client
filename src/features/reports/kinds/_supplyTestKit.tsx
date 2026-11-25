import * as React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { Lang } from '@/store/lang';
import type { ReportDataOf, ReportDetail, ReportKind } from '@dk/shared/types';

import type { KindView } from '../types';

/**
 * Test helpers for the five "water, supply, MDG" kinds: a report envelope, one fixture per
 * kind with overrides, and a render that puts the overlay inside a router whose chat route
 * writes down where it was sent. Not a test file itself (the runner only picks `*.test.*`).
 */

export function reportDetail(over: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id: 'r1',
    kind: 'kavach',
    status: 'ok',
    sentAt: '2026-11-24T06:30:00.000Z',
    headline: '',
    attachments: [],
    conversationId: 'conv-1',
    messageId: 'msg-1',
    live: {},
    ...over,
  };
}

/** The windows of a day, two hours each from midnight: one entry per state given. */
export function waterSlots(states: Array<'recorded' | 'missed' | 'open'>) {
  return states.map((state, i) => ({
    label: `${i * 2}-${i * 2 + 2}`,
    startMin: i * 120,
    endMin: (i + 1) * 120,
    state,
    byService: state === 'recorded',
    updatedOn: state === 'recorded' ? '2026-11-24' : null,
  }));
}

export function water(over: Partial<ReportDataOf<'water_ingress'>> = {}): ReportDataOf<'water_ingress'> {
  const states: Array<'recorded' | 'missed' | 'open'> = [
    'recorded', 'recorded', 'recorded', 'missed', 'recorded', 'recorded',
    'recorded', 'recorded', 'missed', 'recorded', 'recorded', 'recorded',
  ];
  return {
    kind: 'water_ingress',
    v: 1,
    outletCode: '12E',
    businessDate: '2026-11-23',
    capturedAt: '2026-11-24T06:30:00.000Z',
    lastCheckAt: '2026-11-24T06:28:00.000Z',
    dayState: 'finished',
    operating: { from: '00:00', to: '24:00', allDay: true },
    totalSlots: 12,
    recordedSlots: 10,
    missedSlots: 2,
    openSlots: 0,
    compliancePercent: 83,
    lastCheckFailed: false,
    slots: waterSlots(states),
    ...over,
  };
}

export function supply(over: Partial<ReportDataOf<'ro_supply'>> = {}): ReportDataOf<'ro_supply'> {
  return {
    kind: 'ro_supply',
    v: 1,
    outletCode: '12E',
    capturedAt: '2026-11-24T04:44:00.000Z',
    read: 'ok',
    blocked: false,
    failingCount: 2,
    unknownCount: 0,
    lastGoodIsOld: false,
    rows: [
      { cond: 'pending_otp', mark: 'NO', portalText: 'Pending OTP' },
      { cond: 'mock_drill', mark: 'NO', portalText: 'Quaterly Mock Drill Not Conducted' },
      { cond: 'automation_data', mark: 'YES', portalText: 'Automation data not received' },
      { cond: 'sdms_dar_block', mark: 'YES', portalText: 'Blocked in SDMS-DAR' },
    ],
    ...over,
  };
}

export function duEvent(over: Partial<ReportDataOf<'du_otp'>['events'][number]> = {}) {
  return {
    otpId: 'otp-1',
    duMake: 'Gilbarco',
    duModel: 'Encore 300',
    duSerial: '4821',
    nozzleNo: '3',
    transactionDate: '2026-10-22',
    transactionDateText: '22-10-2026',
    portalStatus: 'New OTP Event',
    groupKey: 'du-4821',
    ...over,
  };
}

export function duOtp(over: Partial<ReportDataOf<'du_otp'>> = {}): ReportDataOf<'du_otp'> {
  return {
    kind: 'du_otp',
    v: 1,
    outletCode: '12E',
    phase: 'pending',
    supplyBlocked: true,
    readAt: '2026-11-24T10:10:00.000Z',
    events: [duEvent(), duEvent({ otpId: 'otp-2', nozzleNo: '4' }), duEvent({ otpId: 'otp-3', duSerial: '9', groupKey: 'du-9', nozzleNo: '1' })],
    moreCount: 0,
    ...over,
  };
}

export function kavach(over: Partial<ReportDataOf<'kavach'>> = {}): ReportDataOf<'kavach'> {
  return {
    kind: 'kavach',
    v: 1,
    outletCode: '12E',
    businessDate: '2026-11-24',
    computedAt: '2026-11-24T04:30:00.000Z',
    scored: true,
    scorePublishable: true,
    pct: 87,
    validPoints: 12,
    totalPoints: 14,
    unverifiedCount: 11,
    asks: [
      { code: 'forecourt', itemId: 'it-1', label: { en: 'Forecourt photo', hi: 'फोरकोर्ट की फ़ोटो' }, points: 30, state: 'asked' },
    ],
    pending: [
      { code: 'lic', label: { en: 'Licence copy', hi: 'लाइसेंस की कॉपी' }, points: 20, status: 'EXPIRING_SOON' },
      { code: 'fire', label: { en: 'Fire drill', hi: 'फ़ायर ड्रिल' }, points: 10, status: 'NOT_YET_VERIFIED' },
    ],
    pendingOverflow: 0,
    ...over,
  };
}

export function announcement(over: Partial<ReportDataOf<'announcement'>> = {}): ReportDataOf<'announcement'> {
  return {
    kind: 'announcement',
    v: 1,
    announcementId: 'an-1',
    title: 'TT Acknowledgement ab raat ko hum karenge',
    tone: 'new',
    body: 'Aaj se *hamari team* raat ko acknowledgement kar degi.\nDetail: https://mdgservices.in/guide/tt-ack.',
    serviceId: null,
    videoId: null,
    sentAt: '2026-11-24T06:00:00.000Z',
    ackable: false,
    ...over,
  };
}

/** Writes the place it was sent to, so a test can read it. */
function Where(): React.ReactElement {
  const loc = useLocation();
  const state = loc.state as { jumpToMessageId?: string } | null;
  return (
    <p data-testid="where" data-path={loc.pathname} data-jump={state?.jumpToMessageId ?? ''}>
      chat
    </p>
  );
}

/** Render an overlay of a kind, in a router with a `/chat/:id` route that writes where it landed. */
export function renderOverlay<K extends ReportKind>(
  view: KindView<K>,
  data: ReportDataOf<K>,
  lang: Lang = 'en',
  report: ReportDetail = reportDetail({ kind: view.kind }),
) {
  const Overlay = view.Overlay;
  return render(
    <MemoryRouter
      initialEntries={['/report/conv-1/msg-1']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/report/*" element={<Overlay data={data} report={report} lang={lang} />} />
        <Route path="/chat/:id" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

export const DEVANAGARI = /[ऀ-ॿ]/;
