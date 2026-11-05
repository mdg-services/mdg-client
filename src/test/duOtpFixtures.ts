import type {
  DuOtpAckView,
  DuOtpEntryView,
  DuOtpFileView,
  DuOtpGroupView,
  DuOtpInputs,
} from '@dk/shared/types';

/** Builders for the DU OTP view (ADR 0033), as `GET /me/du-otp` answers it. */

export function makeDuOtpEntry(over: Partial<DuOtpEntryView> = {}): DuOtpEntryView {
  return {
    otpId: '2E20261022103000',
    eventId: 'EV-1001',
    transactionDateText: '22-OCT-26',
    transactionDate: '2026-10-22',
    transactionIds: 'TX-1',
    startText: '22-OCT-26 10:30',
    finishText: '22-OCT-26 11:10',
    duMake: 'Gilbarco',
    duModel: 'Encore 300',
    duSerial: 'GB12345',
    nozzleNo: '1',
    systemReason: 'TIPL Data,14|default 0,2|default 000000',
    recordType: 'DUOTP',
    portalStatus: 'New OTP Event',
    id: 'e1',
    state: 'pending',
    calibrationDate: '2026-10-22',
    firstSeenAt: '2026-11-05T05:00:00.000Z',
    lastSeenAt: '2026-11-05T05:00:00.000Z',
    submittedAt: null,
    portalReply: null,
    failure: null,
    ...over,
  };
}

export function makeDuOtpFile(over: Partial<DuOtpFileView> = {}): DuOtpFileView {
  return {
    key: 'dealers/d1/du-otp/certificate.pdf',
    filename: 'certificate.pdf',
    size: 120_000,
    source: 'dealer',
    at: '2026-11-05T06:00:00.000Z',
    url: 'https://files.example.test/certificate.pdf',
    ...over,
  };
}

export function makeDuOtpInputs(over: Partial<DuOtpInputs> = {}): DuOtpInputs {
  return {
    reasons: [],
    certificate: null,
    serviceReport: null,
    other: null,
    otherSkipped: false,
    remarks: null,
    ...over,
  };
}

export function makeDuOtpGroup(over: Partial<DuOtpGroupView> = {}): DuOtpGroupView {
  return {
    key: 'GB12345',
    duMake: 'Gilbarco',
    duModel: 'Encore 300',
    duSerial: 'GB12345',
    entries: [makeDuOtpEntry()],
    inputs: makeDuOtpInputs(),
    step: null,
    state: 'pending',
    suggestedRemarks: '',
    ...over,
  };
}

export function makeDuOtpView(over: Partial<DuOtpAckView> = {}): DuOtpAckView {
  return {
    dealerId: 'd1',
    active: true,
    groups: [],
    recent: [],
    certificateOnFile: null,
    fetch: { state: 'idle', message: null, at: null },
    supplyBlockedForOtp: null,
    lastCheckedAt: '2026-11-05T05:05:00.000Z',
    lastCheckFailure: null,
    ...over,
  };
}
