import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { PhotoRejected } from '@/lib/uploadMockDrillPhoto';
import { useLangStore } from '@/store/lang';
import {
  makeCollecting,
  makeMockDrillDependent,
  makeMockDrillOpen,
  makeMockDrillPhoto,
  makeMockDrillView,
} from '@/test/mockDrillFixtures';
import { renderWithProviders } from '@/test/utils';
import { mockDrillAnswerSchema } from '@dk/shared/schemas';
import type { MockDrillView } from '@dk/shared/types';

import { MockDrillBox } from './MockDrillBox';

// The hooks are doubles: these tests are about what the box draws and sends in
// each state. The road through the real hooks is in the bubble test.
const h = vi.hoisted(() => ({
  view: {
    data: undefined as MockDrillView | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  answer: { mutateAsync: vi.fn(), isPending: false },
  photo: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock('@/hooks/api/useMockDrill', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useMockDrill: () => h.view,
  useAnswerMockDrill: () => h.answer,
  useAnswerMockDrillPhoto: () => h.photo,
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.view.data = makeMockDrillView();
  h.view.isPending = false;
  h.view.isError = false;
  h.view.refetch.mockReset();
  for (const m of [h.answer, h.photo]) {
    m.mutateAsync.mockReset();
    m.mutateAsync.mockResolvedValue(undefined);
    m.isPending = false;
  }
});
afterEach(() => cleanup());

const box = () => renderWithProviders(<MockDrillBox />);
const show = (view: MockDrillView) => {
  h.view.data = view;
};

/** The body of the last answer posted, which must be one the server's schema accepts. */
function lastBody(): unknown {
  const calls = h.answer.mutateAsync.mock.calls;
  const body = calls[calls.length - 1]?.[0];
  expect(mockDrillAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
  return body;
}

const slotInput = (slot: 1 | 2) =>
  document.querySelector<HTMLInputElement>(`[data-photo-slot="${slot}"] input[type="file"]`)!;

const photoFile = (name = 'drill.jpg', type = 'image/jpeg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('MockDrillBox — the screens before anything is open', () => {
  it('says it is loading, then draws nothing else until the view is here', () => {
    h.view.data = undefined;
    h.view.isPending = true;
    const { container } = box();
    expect(container.querySelector('[data-mock-drill]')).toHaveAttribute('data-screen', 'loading');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry when the view could not be read', () => {
    h.view.data = undefined;
    h.view.isError = true;
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.view.refetch).toHaveBeenCalledTimes(1);
  });

  it('start: one friendly line and the list of emergencies already open; one tap starts the report', async () => {
    show(makeMockDrillView({ screen: 'start' }));
    box();
    expect(screen.getByText(/Did you do a mock drill\?/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Electrical Fire in DU/ }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'scenario', scenarioId: 'e18' });
  });

  it('start: says what IndianOil sent back, when it sent the last report back', () => {
    show(
      makeMockDrillView({
        screen: 'start',
        portal: { state: 'returned', returnRemark: 'Photo is not clear', checkedAt: null },
      }),
    );
    box();
    expect(
      screen.getByText('IndianOil sent your last report back: Photo is not clear'),
    ).toBeInTheDocument();
  });

  it('choose: two big buttons, the saved scenario named on the first', async () => {
    show(
      makeMockDrillView({
        screen: 'choose',
        setup: {
          ...makeMockDrillDependent({
            scenarioId: 'e15',
            scenarioLabel: 'Fire during TT decantation',
          }),
          photos: [],
          approvedAt: '2026-10-01T00:00:00.000Z',
          approvedBy: 'Admin',
        },
      }),
    );
    box();
    const same = screen.getByRole('button', { name: /Same as last time/ });
    expect(within(same).getByText('Fire during TT decantation')).toBeInTheDocument();
    expect(same.className).toContain('min-h-11');
    const fresh = screen.getByRole('button', { name: 'A new kind of drill' });
    expect(fresh.className).toContain('min-h-11');

    fireEvent.click(same);
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'start_same' });
    fireEvent.click(fresh);
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(2));
    expect(lastBody()).toEqual({ step: 'start_new' });
  });

  it('is quiet when the service is not switched on for the pump', () => {
    show(makeMockDrillView({ active: false, screen: 'start' }));
    box();
    expect(
      screen.getByText('Mock drill reports are not switched on for your pump.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});

describe('MockDrillBox — the scenario step', () => {
  it('opens a list inside the chat: the common ones first, the rest behind "More options"', () => {
    show(makeCollecting('scenario'));
    box();
    expect(screen.getByText('Which emergency did you practise?')).toBeInTheDocument();
    // Nothing picked yet: the list is already open.
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toBe('Electrical Fire in DU');
    expect(options).toContain('Fall from height');
    // The uncommon ones are not drawn until asked for.
    expect(screen.queryByRole('option', { name: /Pinhole leakage/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('option', { name: /Pinhole leakage from Piping/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /BLEVE/ })).toBeInTheDocument();
  });

  it("shows the portal's English label alone in English, with a Hindi gloss under it in Hindi", () => {
    show(makeCollecting('scenario'));
    const { unmount } = box();
    expect(screen.queryByText('DU में बिजली से आग')).toBeNull();
    unmount();

    useLangStore.setState({ lang: 'hi', explicit: false });
    box();
    const option = screen.getByRole('option', { name: /Electrical Fire in DU/ });
    expect(within(option).getByText('Electrical Fire in DU')).toBeInTheDocument();
    expect(within(option).getByText('DU में बिजली से आग')).toBeInTheDocument();
  });

  it('shows no gloss where it cannot be certain: the English label stands alone', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(makeCollecting('scenario'));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'और विकल्प' }));
    const option = screen.getByRole('option', { name: /BLEVE/ });
    expect(option.querySelectorAll('span.block')).toHaveLength(1);
  });

  it('picking one posts the scenario id, from a 44px row', async () => {
    show(makeCollecting('scenario'));
    box();
    const row = screen.getByRole('option', { name: /Fire during TT decantation/ });
    expect(row.className).toContain('min-h-11');
    fireEvent.click(row);
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'scenario', scenarioId: 'e15' });
  });

  it('can pick one of the "more options" too', async () => {
    show(makeCollecting('scenario'));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('option', { name: /Pinhole leakage from Piping/ }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'scenario', scenarioId: 'e2' });
  });

  it('shows the scenario already picked when the owner comes back to this step', () => {
    show(
      makeCollecting('scenario', {
        dependent: makeMockDrillDependent({
          scenarioId: 'e2',
          scenarioLabel: 'Pinhole leakage from Piping',
        }),
      }),
    );
    box();
    expect(screen.getByRole('button', { name: /Pinhole leakage from Piping/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pinhole leakage from Piping/ }));
    // Its group is already open, with the pick marked.
    expect(
      screen.getByRole('option', { name: /Pinhole leakage/, selected: true }),
    ).toBeInTheDocument();
  });
});

describe('MockDrillBox — the photos step', () => {
  const dependent = (n: 0 | 1 | 2) =>
    makeMockDrillDependent({
      photos: [
        makeMockDrillPhoto(),
        makeMockDrillPhoto({ key: 'k2', filename: 'photo-2.jpg', url: null }),
      ].slice(0, n),
    });

  it('draws two slots, each a 44px button; the second waits for the first', () => {
    show(makeCollecting('photos', { dependent: dependent(0) }));
    box();
    expect(screen.getByText('Photo 1')).toBeInTheDocument();
    expect(screen.getByText('Photo 2')).toBeInTheDocument();
    expect(slotInput(1)).toHaveAttribute('accept', 'image/*');
    expect(slotInput(1).closest('label')!.className).toContain('min-h-11');
    expect(slotInput(1)).not.toBeDisabled();
    expect(slotInput(2)).toBeDisabled();
    expect(screen.getByText('Add photo 1 first.')).toBeInTheDocument();
  });

  it('posts each photo with its slot, the outlet, and the file', async () => {
    show(makeCollecting('photos', { dependent: dependent(1) }));
    box();
    const one = photoFile('one.jpg');
    fireEvent.change(slotInput(1), { target: { files: [one] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.photo.mutateAsync).toHaveBeenLastCalledWith({ dealerId: 'd1', slot: 1, file: one });

    const two = photoFile('two.jpg');
    fireEvent.change(slotInput(2), { target: { files: [two] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.photo.mutateAsync).toHaveBeenLastCalledWith({ dealerId: 'd1', slot: 2, file: two });
    // A photo is not a plain answer.
    expect(h.answer.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a thumbnail for a photo that is there, and "Replace" in place of "Take or choose"', () => {
    show(makeCollecting('photos', { dependent: dependent(1) }));
    box();
    const slot1 = document.querySelector('[data-photo-slot="1"]') as HTMLElement;
    expect(within(slot1).getByRole('img', { name: 'Photo 1' })).toHaveAttribute(
      'src',
      'https://files.example.test/photo-1.jpg',
    );
    expect(within(slot1).getByText('Replace')).toBeInTheDocument();
    expect(within(slot1).getByText('Added')).toBeInTheDocument();
    const slot2 = document.querySelector('[data-photo-slot="2"]') as HTMLElement;
    expect(within(slot2).getByText('Take or choose a photo')).toBeInTheDocument();
  });

  it('opens a photo full screen inside the app, not as a new-tab link', () => {
    show(makeCollecting('photos', { dependent: dependent(1) }));
    box();
    const slot1 = document.querySelector('[data-photo-slot="1"]') as HTMLElement;
    // Inside the phone app a link to the photo's storage address went to the browser.
    expect(within(slot1).queryByRole('link')).toBeNull();
    fireEvent.click(within(slot1).getByRole('button', { name: 'Photo 1' }));
    const viewer = screen.getByRole('dialog', { name: 'Photo 1' });
    expect(within(viewer).getByRole('img')).toHaveAttribute(
      'src',
      'https://files.example.test/photo-1.jpg',
    );
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets the owner replace a photo: the same slot is posted again', async () => {
    show(makeCollecting('photos', { dependent: dependent(2) }));
    box();
    const again = photoFile('again.jpg');
    fireEvent.change(slotInput(1), { target: { files: [again] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.photo.mutateAsync).toHaveBeenCalledWith({ dealerId: 'd1', slot: 1, file: again });
  });

  it('says in plain words when the file is not a photo', async () => {
    show(makeCollecting('photos', { dependent: dependent(0) }));
    h.photo.mutateAsync.mockRejectedValue(new PhotoRejected('type'));
    box();
    fireEvent.change(slotInput(1), { target: { files: [photoFile('x.pdf', 'application/pdf')] } });
    expect(
      await screen.findByText('That is not a photo. Choose a JPEG, PNG or WebP photo.'),
    ).toBeInTheDocument();
  });

  it('says in plain words when the photo is over 5 MB', async () => {
    show(makeCollecting('photos', { dependent: dependent(0) }));
    h.photo.mutateAsync.mockRejectedValue(new PhotoRejected('size'));
    box();
    fireEvent.change(slotInput(1), { target: { files: [photoFile()] } });
    expect(
      await screen.findByText('That photo is over 5 MB. Choose a smaller one.'),
    ).toBeInTheDocument();
  });

  it("shows the server's own words for a refusal, and a plain line for a dropped network", async () => {
    show(makeCollecting('photos', { dependent: dependent(0) }));
    h.photo.mutateAsync.mockRejectedValueOnce(new ApiError(400, 'BAD', 'Send an image.'));
    box();
    fireEvent.change(slotInput(1), { target: { files: [photoFile()] } });
    expect(await screen.findByText('Send an image.')).toBeInTheDocument();

    h.photo.mutateAsync.mockRejectedValueOnce(new Error('network'));
    fireEvent.change(slotInput(1), { target: { files: [photoFile()] } });
    expect(
      await screen.findByText('The upload did not go through. Check your network and try again.'),
    ).toBeInTheDocument();
  });

  it('turns every control off while a photo is on its way', () => {
    show(makeCollecting('photos', { dependent: dependent(1) }));
    h.photo.isPending = true;
    box();
    expect(slotInput(1)).toBeDisabled();
    expect(slotInput(2)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });
});

describe('MockDrillBox — the "when" step', () => {
  it("says plainly that the tap is the owner's word that the drill happened", () => {
    show(makeCollecting('when'));
    box();
    expect(
      screen.getByText(
        'Send this only if the drill really happened. Pressing a button means the drill was really done.',
      ),
    ).toBeInTheDocument();
  });

  it('"Drill done today" posts today with confirmDone', async () => {
    show(makeCollecting('when'));
    box();
    const today = screen.getByRole('button', { name: 'Drill done today' });
    expect(today.className).toContain('min-h-11');
    fireEvent.click(today);
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'when', day: 'today', confirmDone: true });
  });

  it('"Drill done yesterday" posts yesterday with confirmDone', async () => {
    show(makeCollecting('when'));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Drill done yesterday' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'when', day: 'yesterday', confirmDone: true });
  });

  it('speaks Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(makeCollecting('when'));
    box();
    expect(screen.getByRole('button', { name: 'आज की ड्रिल' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'कल की ड्रिल' })).toBeInTheDocument();
    expect(screen.getByText(/ड्रिल सचमुच की गई हो, तभी भेजें/)).toBeInTheDocument();
  });
});

describe('MockDrillBox — the review', () => {
  const full = (over: Partial<ReturnType<typeof makeMockDrillOpen>> = {}) =>
    makeCollecting('review', {
      confirmedDay: '2026-11-10',
      dependent: makeMockDrillDependent({
        photos: [
          makeMockDrillPhoto(),
          makeMockDrillPhoto({
            key: 'k2',
            filename: 'p2.jpg',
            url: 'https://files.example.test/p2.jpg',
          }),
        ],
      }),
      ...over,
    });

  it('shows the scenario, both photos and the day, and one "Send" button', async () => {
    show(full());
    box();
    expect(screen.getByText('Electrical Fire in DU')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo 2' })).toBeInTheDocument();
    expect(screen.getByText('10-11-2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'submit' });
  });

  it('says that the team looks at the photos first for a new drill, not for the same as last time', () => {
    show(full({ mode: 'new' }));
    const { unmount } = box();
    expect(screen.getByText(/The MDG team will look at the photos first/)).toBeInTheDocument();
    unmount();
    show(full({ mode: 'same' }));
    box();
    expect(screen.queryByText(/look at the photos first/)).toBeNull();
    expect(screen.getByText('The report will go on the IndianOil website.')).toBeInTheDocument();
  });

  it('for "same as last time" draws the saved setup when the submission carries none', () => {
    show(
      makeCollecting(
        'review',
        { mode: 'same', confirmedDay: '2026-11-11', dependent: null },
        {
          setup: {
            ...makeMockDrillDependent({
              scenarioId: 'e15',
              scenarioLabel: 'Fire during TT decantation',
              photos: [makeMockDrillPhoto()],
            }),
            approvedAt: '2026-10-01T00:00:00.000Z',
            approvedBy: null,
          },
        },
      ),
    );
    box();
    expect(screen.getByText('Fire during TT decantation')).toBeInTheDocument();
    expect(screen.getByText('11-11-2026')).toBeInTheDocument();
  });
});

describe('MockDrillBox — back and cancel', () => {
  it('"Back" and "Cancel" post their own answers from the later steps', async () => {
    show(makeCollecting('photos', { dependent: makeMockDrillDependent() }));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'back' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(2));
    expect(lastBody()).toEqual({ step: 'cancel' });
  });

  it('has no "Back" on the very first question, only on one that follows "same / new"', () => {
    show(makeCollecting('scenario'));
    const { unmount } = box();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    unmount();

    show(
      makeCollecting(
        'scenario',
        {},
        {
          setup: {
            ...makeMockDrillDependent(),
            approvedAt: '2026-10-01T00:00:00.000Z',
            approvedBy: null,
          },
        },
      ),
    );
    box();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('speaks Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(makeCollecting('when'));
    box();
    expect(screen.getByRole('button', { name: 'वापस' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'रद्द करें' })).toBeInTheDocument();
  });

  it('tells the owner why the team sent it back', () => {
    show(
      makeCollecting('photos', {
        sentBackReason: 'Photo 2 is blurred',
        dependent: makeMockDrillDependent(),
      }),
    );
    box();
    expect(screen.getByText('The MDG team sent this back: Photo 2 is blurred')).toBeInTheDocument();
  });

  it('shows the words of a refused answer under the step', async () => {
    show(makeCollecting('when'));
    h.answer.mutateAsync.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'That step has already moved.'),
    );
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Drill done today' }));
    expect(await screen.findByText('That step has already moved.')).toBeInTheDocument();
  });
});

describe('MockDrillBox — after sending', () => {
  it('waiting for the team: says they are looking at the photos', () => {
    show(makeMockDrillView({ screen: 'waiting', open: makeMockDrillOpen({ state: 'review' }) }));
    box();
    expect(screen.getByRole('status')).toHaveTextContent('The MDG team is looking at your photos');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('waiting for the filing: says the report is going onto the website', () => {
    show(
      makeMockDrillView({ screen: 'waiting', open: makeMockDrillOpen({ state: 'submitting' }) }),
    );
    box();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Putting your report on the IndianOil website',
    );
  });

  it('done: says it is on the website, with the day it went', () => {
    show(
      makeMockDrillView({
        screen: 'done',
        open: makeMockDrillOpen({ state: 'submitted', submittedAt: '2026-11-11T08:00:00.000Z' }),
      }),
    );
    box();
    expect(
      screen.getByText(
        'Done. Your report went on the IndianOil website on 11-11-2026. Their officer will approve it next.',
      ),
    ).toBeInTheDocument();
  });

  it('done: still reads well with no date', () => {
    show(makeMockDrillView({ screen: 'done' }));
    box();
    expect(
      screen.getByText(
        'Done. Your report went on the IndianOil website. Their officer will approve it next.',
      ),
    ).toBeInTheDocument();
  });

  it('blocked: says the last report is still waiting for approval', () => {
    show(makeMockDrillView({ screen: 'blocked' }));
    box();
    expect(
      screen.getByText(/still waiting for approval on the IndianOil website/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("failed: shows the server's words, says the team knows, offers no button", () => {
    show(
      makeMockDrillView({
        screen: 'failed',
        open: makeMockDrillOpen({ state: 'failed', failure: 'IndianOil was not reachable.' }),
      }),
    );
    box();
    expect(screen.getByText('IndianOil was not reachable.')).toBeInTheDocument();
    expect(screen.getByText('The MDG team has been told.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('failed: falls back to a plain line when the server gave none', () => {
    show(makeMockDrillView({ screen: 'failed', open: makeMockDrillOpen({ state: 'failed' }) }));
    box();
    expect(screen.getByText('The report did not go through.')).toBeInTheDocument();
  });
});

describe('MockDrillBox — the words', () => {
  it('never says "Sir", "SDMS" or a technical id, in either language', () => {
    for (const lang of ['en', 'hi'] as const) {
      useLangStore.setState({ lang, explicit: false });
      for (const view of [
        makeMockDrillView({ screen: 'start' }),
        makeCollecting('when'),
        makeMockDrillView({ screen: 'blocked' }),
        makeMockDrillView({ screen: 'done' }),
      ]) {
        show(view);
        const { container, unmount } = box();
        expect(container.textContent).not.toMatch(/\bSir\b|SDMS|portal|e\d{1,2}\b/i);
        unmount();
      }
    }
  });
});
