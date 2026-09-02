import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import type * as UploadModule from '@/lib/uploadKavachProof';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type {
  Attachment,
  KavachItem,
  KavachProgramme,
  KavachRequestState,
} from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});
vi.mock('@/lib/uploadKavachProof', async (orig) => {
  const actual = await orig<typeof UploadModule>();
  return { ...actual, uploadKavachProof: vi.fn() };
});

const { uploadKavachProof } = await import('@/lib/uploadKavachProof');
const useKavachModule = await import('@/hooks/api/useKavach');
const { KavachPage } = await import('./KavachPage');

function makeItem(overrides: Partial<KavachItem> = {}): KavachItem {
  return {
    id: 'i1',
    programmeId: 'p1',
    dealerId: 'd1',
    templateCode: 'code-1',
    custom: false,
    titleEn: 'Fire extinguisher check',
    titleHi: 'अग्निशामक जाँच',
    labelEn: 'Fire extinguisher check',
    labelHi: 'अग्निशामक जाँच',
    points: 100,
    cadenceDays: 30,
    trigger: 'TIME',
    cadenceBucket: 'MONTHLY',
    domain: 'safety',
    category: 'other',
    verification: 'ADMIN',
    evidence: 'PHOTO',
    tier: 'STANDARD',
    warnWindowDays: 3,
    status: 'EXPIRED',
    request: { state: 'NONE', askedCount: 0 },
    paused: false,
    history: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as KavachItem;
}

function request(
  state: KavachRequestState,
  extra: Partial<KavachItem['request']> = {},
): KavachItem['request'] {
  return { state, askedCount: 1, openedBy: 'admin', ...extra };
}

function makeProgramme(notYetVerifiedCount = 0): KavachProgramme {
  return {
    id: 'p1',
    dealerId: 'd1',
    status: 'ACTIVE',
    outlet: { monthYear: '2026-01' },
    score: {
      /**
       * REQUIRED, and it was missing.
       *
       * Without it this fixture is a programme with no denominator, which the
       * page treats as settling-in — and it still rendered "80%" in the middle
       * of the ring, because the settling state used to change only the colour
       * and the caption. That is exactly the leak `kavachScoreIsPublishable`
       * closes, so the fixture now has to say what it means: a scored
       * programme, published, showing its number.
       */
      scored: true,
      overallPct: 80,
      byBucket: {},
      validPoints: 0,
      totalPoints: 585,
      notYetVerifiedCount,
      notYetVerifiedPoints: notYetVerifiedCount * 10,
      heldCount: 0,
      computedAt: '2026-01-01T00:00:00.000Z',
    },
    totalPoints: 585,
    dealerFacingEnabled: true,
    initiatedByAdminId: 'a1',
    initiatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '',
    updatedAt: '',
  } as KavachProgramme;
}

/** The server's state, so a refetch after a mutation answers what the POST did. */
let me: { programme: KavachProgramme; items: KavachItem[] };

function serve(): void {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/v1/kavach/me') return Promise.resolve(me) as Promise<never>;
    if (path === '/v1/conversations/mine') {
      return Promise.resolve([{ id: 'c1', userId: 'u1' }]) as Promise<never>;
    }
    return Promise.resolve(null) as Promise<never>;
  });
}

beforeEach(() => {
  // The dealer's own id, not a conversation, is what an evidence upload needs
  // now — without it the card refuses to open the camera.
  signIn({ id: 'u1', dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  me = { programme: makeProgramme(), items: [] };
  serve();
});

afterEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(uploadKavachProof).mockReset();
  resetStores();
});

describe('KavachPage', () => {
  it('puts what MDG has asked for above the health ring', async () => {
    me.items = [
      makeItem({ id: 'i1', request: request('ASKED') }),
      makeItem({
        id: 'i2',
        labelEn: 'Weighbridge calibration',
        status: 'EXPIRING_SOON',
      }),
    ];
    renderWithProviders(<KavachPage />, { route: '/kavach' });

    const ask = await screen.findByText('We need from you');
    const ring = await screen.findByText('80%');
    // The one action they have must sit above the number the app keeps about them.
    expect(
      ask.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the admin's reject reason verbatim on a returned photo", async () => {
    me.items = [
      makeItem({
        request: request('REJECTED', {
          rejectReason: 'The gauge is not readable in this photo.',
        }),
      }),
    ];
    renderWithProviders(<KavachPage />, { route: '/kavach' });

    expect(
      await screen.findByText('The gauge is not readable in this photo.'),
    ).toBeInTheDocument();
  });

  it('sending a photo shows a waiting state, never a done state', async () => {
    me.items = [makeItem({ request: request('ASKED') })];
    const proof: Attachment = {
      storageKey: 'k',
      filename: 'p.jpg',
      contentType: 'image/jpeg',
      size: 10,
      kind: 'image',
    };
    vi.mocked(uploadKavachProof).mockResolvedValue(proof);
    vi.mocked(api.post).mockImplementation((path: string) => {
      const submitted = makeItem({
        request: request('SUBMITTED', {
          openedBy: 'dealer',
          submission: { at: '2026-08-24T06:00:00.000Z', byUserId: 'u1', proof },
        }),
      });
      expect(path).toBe('/v1/kavach/items/i1/evidence');
      // The clock and the score are the server's to move, and it did not:
      // sending is not certifying.
      me = { ...me, items: [submitted] };
      return Promise.resolve(submitted) as Promise<never>;
    });

    const { container } = renderWithProviders(<KavachPage />, { route: '/kavach' });
    await screen.findByText('We need from you');

    const camera = container.querySelector('input[capture]');
    expect(camera).not.toBeNull();
    fireEvent.change(camera as HTMLInputElement, {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });

    expect(
      await screen.findByText('Sent — the MDG team is looking'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This is not finished yet. It counts once the MDG team has checked it.',
      ),
    ).toBeInTheDocument();
    // Nothing on the screen may read as a completion.
    expect(screen.queryByText('Checked by the MDG team — 24 Aug')).toBeNull();
    expect(screen.queryByText(/^Done/)).toBeNull();
  });

  it('retries a failed send with the same photo, not as a bare claim', async () => {
    me.items = [makeItem({ request: request('ASKED') })];
    const proof: Attachment = {
      storageKey: 'k',
      filename: 'p.jpg',
      contentType: 'image/jpeg',
      size: 10,
      kind: 'image',
    };
    vi.mocked(uploadKavachProof).mockResolvedValue(proof);
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(500, 'SERVER', 'boom'))
      .mockResolvedValueOnce(makeItem({ request: request('SUBMITTED') }));

    const { container } = renderWithProviders(<KavachPage />, { route: '/kavach' });
    await screen.findByText('We need from you');
    fireEvent.change(container.querySelector('input[capture]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });

    const retry = await screen.findByRole('button', {
      name: "Didn't send — tap to try again",
    });
    fireEvent.click(retry);

    // Both attempts carry the photo. Retrying with an empty body would quietly
    // turn "here is what you asked for" into "I've done this".
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    for (const call of vi.mocked(api.post).mock.calls) {
      expect(call[1]).toEqual({ proof });
    }
  });

  it("the 'I've done this' claim posts an empty body", async () => {
    me.items = [makeItem({ id: 'i2', status: 'NOT_YET_VERIFIED' })];
    vi.mocked(api.post).mockResolvedValue(
      makeItem({ id: 'i2', request: request('SUBMITTED', { openedBy: 'dealer' }) }),
    );

    renderWithProviders(<KavachPage />, { route: '/kavach' });
    fireEvent.click(await screen.findByRole('button', { name: "I've done this" }));

    // No proof, no note: a claim queues the task for review and moves nothing.
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/v1/kavach/items/i2/evidence', {}),
    );
    expect(
      screen.getByText(
        'This asks the MDG team to come and check. It does not finish the task.',
      ),
    ).toBeInTheDocument();
  });

  it('says in words how many things have never been checked', async () => {
    me = { programme: makeProgramme(11), items: [] };
    renderWithProviders(<KavachPage />, { route: '/kavach' });

    expect(
      await screen.findByText('We have not checked 11 things at your pump yet.'),
    ).toBeInTheDocument();
  });

  it('phrases a HELD task as our failure and offers no claim for it', async () => {
    me.items = [makeItem({ status: 'HELD' })];
    renderWithProviders(<KavachPage />, { route: '/kavach' });

    expect(await screen.findByText('We could not check this yet')).toBeInTheDocument();
    expect(
      screen.getByText('This one is on us, not on you. We are sorting it out.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've done this" })).toBeNull();
  });

  it('attributes a past check to the MDG team, never to a person', async () => {
    me.items = [
      makeItem({
        status: 'VALID',
        lastVerifiedAt: '2026-08-24T06:00:00.000Z',
        lastVerifiedByKind: 'admin',
      }),
    ];
    renderWithProviders(<KavachPage />, { route: '/kavach' });

    expect(
      await screen.findByText('Checked by the MDG team — 24 Aug'),
    ).toBeInTheDocument();
  });

  it('gives the dealer no way to mark anything done', async () => {
    me.items = [
      makeItem({ id: 'i1', request: request('ASKED') }),
      makeItem({ id: 'i2', status: 'EXPIRED' }),
      makeItem({ id: 'i3', status: 'NOT_YET_VERIFIED' }),
    ];
    renderWithProviders(<KavachPage />, { route: '/kavach' });
    await screen.findByText('We need from you');

    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/mark done|^\s*done\s*$/i);
    }
    // The hook that drove the old dealer tick is gone, not merely unrendered:
    // /mark-done no longer exists and /verify refuses a dealer token.
    expect(Object.keys(useKavachModule)).not.toContain('useMarkKavachItemDone');
  });
});
