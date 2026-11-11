import { MOCK_DRILL_SCENARIOS } from '@dk/shared/types';
import type {
  MockDrillDependentView,
  MockDrillPhotoView,
  MockDrillSubmissionView,
  MockDrillView,
} from '@dk/shared/types';

/** Builders for the Mock Drill view (ADR 0034), as `GET /me/mock-drill` answers it. */

export function makeMockDrillPhoto(over: Partial<MockDrillPhotoView> = {}): MockDrillPhotoView {
  return {
    key: 'mock-drill/d1/uploads/photo-1.jpg',
    filename: 'photo-1.jpg',
    size: 200_000,
    mime: 'image/jpeg',
    at: '2026-11-11T06:00:00.000Z',
    url: 'https://files.example.test/photo-1.jpg',
    ...over,
  };
}

export function makeMockDrillDependent(
  over: Partial<MockDrillDependentView> = {},
): MockDrillDependentView {
  return {
    scenarioId: 'e18',
    scenarioLabel: 'Electrical Fire in DU',
    photos: [],
    personsPresent: 6,
    headCountShort: 0,
    observers: [],
    observations: '',
    recommendations: '',
    ...over,
  };
}

export function makeMockDrillOpen(
  over: Partial<MockDrillSubmissionView> = {},
): MockDrillSubmissionView {
  return {
    id: 's1',
    state: 'collecting',
    mode: 'new',
    step: 'scenario',
    dependent: null,
    generated: null,
    confirmedDay: null,
    createdAt: '2026-11-11T05:00:00.000Z',
    reviewedAt: null,
    reviewedBy: null,
    sentBackReason: null,
    submittedAt: null,
    portalReply: null,
    failure: null,
    ...over,
  };
}

export function makeMockDrillView(over: Partial<MockDrillView> = {}): MockDrillView {
  return {
    dealerId: 'd1',
    active: true,
    screen: 'start',
    scenarios: MOCK_DRILL_SCENARIOS.map(({ id, label, common }) => ({ id, label, common })),
    open: null,
    setup: null,
    portal: { state: 'none', returnRemark: null, checkedAt: null },
    lastSubmittedAt: null,
    ...over,
  };
}

/** A view on the owner's own steps: `collect`, with an open submission at `step`. */
export function makeCollecting(
  step: NonNullable<MockDrillSubmissionView['step']>,
  open: Partial<MockDrillSubmissionView> = {},
  over: Partial<MockDrillView> = {},
): MockDrillView {
  return makeMockDrillView({
    screen: 'collect',
    open: makeMockDrillOpen({ step, ...open }),
    ...over,
  });
}
