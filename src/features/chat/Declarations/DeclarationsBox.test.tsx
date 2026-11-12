import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { ImageRejected } from '@/lib/squeezeImage';
import { useLangStore } from '@/store/lang';
import {
  makeCollect,
  makeDeclarationsView,
  makeLastPhotos,
  makeWashroomCycle,
  makeWashroomPhoto,
} from '@/test/declarationsFixtures';
import { renderWithProviders } from '@/test/utils';
import { declarationsAnswerSchema } from '@dk/shared/schemas';
import type { DeclarationsView } from '@dk/shared/types';

import { DeclarationsBox } from './DeclarationsBox';

// The hooks are doubles: these tests are about what the box draws and sends in
// each state. The road through the real hooks is in the bubble test.
const h = vi.hoisted(() => ({
  view: {
    data: undefined as DeclarationsView | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  answer: { mutateAsync: vi.fn() },
  photo: { mutateAsync: vi.fn() },
  reuse: { mutateAsync: vi.fn() },
  // What is on its way, for every box: the real one reads the mutations themselves.
  busy: { busy: false, uploadingSlot: null as 'outside' | 'inside' | null, reusing: false },
}));
vi.mock('@/hooks/api/useDeclarations', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useDeclarations: () => h.view,
  useAnswerDeclarations: () => h.answer,
  useAnswerDeclarationsPhoto: () => h.photo,
  useReuseDeclarationsPhotos: () => h.reuse,
  useDeclarationsBusy: () => h.busy,
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.view.data = makeDeclarationsView();
  h.view.isPending = false;
  h.view.isError = false;
  h.view.refetch.mockReset();
  for (const m of [h.answer, h.photo, h.reuse]) {
    m.mutateAsync.mockReset();
    m.mutateAsync.mockResolvedValue(undefined);
  }
  h.busy = { busy: false, uploadingSlot: null, reusing: false };
});
afterEach(() => cleanup());

const box = () => renderWithProviders(<DeclarationsBox />);
const show = (view: DeclarationsView) => {
  h.view.data = view;
};

/** The body of the last answer posted, which must be one the server's schema accepts. */
function lastBody(): unknown {
  const calls = h.answer.mutateAsync.mock.calls;
  const body = calls[calls.length - 1]?.[0];
  expect(declarationsAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
  return body;
}

const slotInput = (slot: 'outside' | 'inside') =>
  document.querySelector<HTMLInputElement>(`[data-photo-slot="${slot}"] input[type="file"]`)!;
const slotBox = (slot: 'outside' | 'inside') =>
  document.querySelector<HTMLElement>(`[data-photo-slot="${slot}"]`)!;
const tick = () =>
  screen.getByRole('checkbox', { name: 'These photos were taken today of my own washroom' });
// A spinner inside the button adds its own word to the name while it is working.
const sendButton = () => screen.getByRole('button', { name: /Send$/ });

const photoFile = (name = 'washroom.jpg', type = 'image/jpeg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('DeclarationsBox — before there is anything to draw', () => {
  it('says it is loading, then draws nothing else until the view is here', () => {
    h.view.data = undefined;
    h.view.isPending = true;
    const { container } = box();
    expect(container.querySelector('[data-declarations]')).toHaveAttribute(
      'data-screen',
      'loading',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry when the view could not be read', () => {
    h.view.data = undefined;
    h.view.isError = true;
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.view.refetch).toHaveBeenCalledTimes(1);
  });

  it('is quiet when the service is not switched on for the pump', () => {
    show(makeDeclarationsView({ active: false, screen: 'collect' }));
    box();
    expect(
      screen.getByText('Washroom photos are not switched on for your pump.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });
});

describe('DeclarationsBox — idle', () => {
  it('says what was last sent and when the next is due', () => {
    show(
      makeDeclarationsView({
        lastWashroomFiledDay: '2026-11-05',
        nextWashroomDueDay: '2026-11-12',
      }),
    );
    box();
    expect(
      screen.getByText(
        'Nothing needed now. Washroom photos last sent 05-11-2026; next due 12-11-2026.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reads well with only one of the two dates, or neither', () => {
    show(makeDeclarationsView({ lastWashroomFiledDay: '2026-11-05' }));
    const first = box();
    expect(
      screen.getByText('Nothing needed now. Washroom photos last sent 05-11-2026.'),
    ).toBeInTheDocument();
    first.unmount();

    show(makeDeclarationsView({ nextWashroomDueDay: '2026-11-12' }));
    const second = box();
    expect(
      screen.getByText('Nothing needed now. Washroom photos are next due 12-11-2026.'),
    ).toBeInTheDocument();
    second.unmount();

    show(makeDeclarationsView());
    box();
    expect(screen.getByText('Nothing needed now.')).toBeInTheDocument();
  });

  it('speaks Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(
      makeDeclarationsView({
        lastWashroomFiledDay: '2026-11-05',
        nextWashroomDueDay: '2026-11-12',
      }),
    );
    box();
    expect(screen.getByText(/अभी कुछ करना नहीं है/)).toBeInTheDocument();
    expect(screen.getByText(/05-11-2026/)).toBeInTheDocument();
    expect(screen.getByText(/12-11-2026/)).toBeInTheDocument();
  });
});

describe('DeclarationsBox — collect: the two photos', () => {
  it('asks for two photos, outside then inside, each from a 44px button that opens the phone chooser', () => {
    show(makeCollect(0));
    box();
    expect(
      screen.getByText('IndianOil needs 2 photos of your washroom this week:'),
    ).toBeInTheDocument();
    const slots = [...document.querySelectorAll('[data-photo-slot]')].map((el) =>
      el.getAttribute('data-photo-slot'),
    );
    expect(slots).toEqual(['outside', 'inside']);
    expect(within(slotBox('outside')).getByText('1. From outside')).toBeInTheDocument();
    expect(within(slotBox('inside')).getByText('2. From inside')).toBeInTheDocument();
    for (const slot of ['outside', 'inside'] as const) {
      expect(slotInput(slot)).toHaveAttribute('accept', 'image/*');
      expect(slotInput(slot)).not.toBeDisabled();
      // The input sits inside its label, so the owner's tap on the label opens the chooser.
      expect(slotInput(slot).closest('label')!.className).toContain('min-h-11');
      expect(within(slotBox(slot)).getByText('Take or choose a photo')).toBeInTheDocument();
    }
  });

  it('posts each photo with its slot, the outlet and the file', async () => {
    show(makeCollect(0));
    box();
    const one = photoFile('one.jpg');
    fireEvent.change(slotInput('outside'), { target: { files: [one] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.photo.mutateAsync).toHaveBeenLastCalledWith({
      dealerId: 'd1',
      slot: 'outside',
      file: one,
    });

    const two = photoFile('two.jpg');
    fireEvent.change(slotInput('inside'), { target: { files: [two] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.photo.mutateAsync).toHaveBeenLastCalledWith({
      dealerId: 'd1',
      slot: 'inside',
      file: two,
    });
    // A photo is not a plain answer.
    expect(h.answer.mutateAsync).not.toHaveBeenCalled();
  });

  it('does not make the inside photo wait for the outside one', () => {
    show(makeCollect(0));
    box();
    expect(slotInput('inside')).not.toBeDisabled();
  });

  it('shows a preview of a photo that is there, "Retake" in place of "Take or choose", and marks it added', () => {
    show(makeCollect(1));
    box();
    const outside = slotBox('outside');
    expect(within(outside).getByRole('img', { name: '1. From outside' })).toHaveAttribute(
      'src',
      'https://files.example.test/outside.jpg',
    );
    expect(within(outside).getByText('Retake')).toBeInTheDocument();
    expect(within(outside).getByText('Added')).toBeInTheDocument();
    // The preview opens the full photo inside the app — never a new-tab link,
    // which the phone app hands to the browser.
    expect(within(outside).queryByRole('link')).toBeNull();
    fireEvent.click(within(outside).getByRole('button', { name: '1. From outside' }));
    const viewer = screen.getByRole('dialog', { name: '1. From outside' });
    expect(within(viewer).getByRole('img')).toHaveAttribute(
      'src',
      'https://files.example.test/outside.jpg',
    );
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const inside = slotBox('inside');
    expect(within(inside).getByText('Take or choose a photo')).toBeInTheDocument();
    expect(within(inside).queryByText('Added')).toBeNull();
  });

  it('a retake posts the same slot again: one call, the server replaces what the slot held', async () => {
    show(makeCollect(2));
    box();
    const again = photoFile('again.jpg');
    fireEvent.change(slotInput('outside'), { target: { files: [again] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.photo.mutateAsync).toHaveBeenCalledWith({
      dealerId: 'd1',
      slot: 'outside',
      file: again,
    });
  });

  it('clears the chooser after each pick so the same file can be chosen again', () => {
    show(makeCollect(0));
    box();
    const input = slotInput('outside');
    fireEvent.change(input, { target: { files: [photoFile()] } });
    expect(input.value).toBe('');
  });

  it('shows the slot that is on its way as "Uploading…", in every box', () => {
    show(makeCollect(0));
    h.busy = { busy: true, uploadingSlot: 'inside', reusing: false };
    box();
    expect(within(slotBox('inside')).getByText('Uploading…')).toBeInTheDocument();
    expect(within(slotBox('outside')).queryByText('Uploading…')).toBeNull();
  });

  it('turns every control off while a photo is on its way', () => {
    show(makeCollect(2));
    h.busy = { busy: true, uploadingSlot: 'outside', reusing: false };
    box();
    expect(slotInput('outside')).toBeDisabled();
    expect(slotInput('inside')).toBeDisabled();
    expect(tick()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });
});

describe('DeclarationsBox — collect: Send on its way', () => {
  it('shows a spinner on Send and turns every control off while the answer is on its way', () => {
    show(makeCollect(2));
    h.busy = { busy: true, uploadingSlot: null, reusing: false };
    box();
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveAttribute('aria-busy', 'true');
    expect(sendButton().querySelector('svg.animate-spin')).not.toBeNull();
    expect(tick()).toBeDisabled();
    expect(slotInput('outside')).toBeDisabled();
    expect(slotInput('inside')).toBeDisabled();
  });
});

describe('DeclarationsBox — collect: a photo turned away', () => {
  const refuse = async (error: unknown, words: string) => {
    show(makeCollect(0));
    h.photo.mutateAsync.mockRejectedValue(error);
    box();
    fireEvent.change(slotInput('outside'), { target: { files: [photoFile()] } });
    expect(await screen.findByText(words)).toBeInTheDocument();
  };

  it('says "too big" with something the owner can do about it', async () => {
    await refuse(
      new ImageRejected('size'),
      'This photo is too big. Take it again from a little further away.',
    );
  });

  it('says plainly when the phone cannot open a HEIC photo', async () => {
    await refuse(
      new ImageRejected('heic'),
      'This kind of photo cannot be opened here. Take a new photo with the camera.',
    );
  });

  it('says plainly when the file is not a photo', async () => {
    await refuse(
      new ImageRejected('type'),
      'That is not a photo. Take a new one, or choose one from your gallery.',
    );
  });

  it('says plainly when the photo cannot be read', async () => {
    await refuse(
      new ImageRejected('unreadable'),
      'This photo could not be read. Take it again, or choose another one.',
    );
  });

  it("shows the server's photo refusal as it is (already Hindi first), and a plain line for the rest", async () => {
    const hindi = 'फ़ोटो पहुँची नहीं। इसे दोबारा भेजिए। (The photo did not arrive. Send it again.)';
    show(makeCollect(0));
    h.photo.mutateAsync.mockRejectedValueOnce(new ApiError(400, 'BAD', hindi));
    box();
    fireEvent.change(slotInput('outside'), { target: { files: [photoFile()] } });
    expect(await screen.findByText(hindi)).toBeInTheDocument();

    // An English-only refusal is never printed raw.
    h.photo.mutateAsync.mockRejectedValueOnce(new ApiError(400, 'BAD', 'Send an image.'));
    fireEvent.change(slotInput('outside'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(screen.queryByText(hindi)).toBeNull());
    expect(screen.queryByText('Send an image.')).toBeNull();
    expect(
      screen.getByText('The upload did not go through. Check your network and try again.'),
    ).toBeInTheDocument();

    h.photo.mutateAsync.mockRejectedValueOnce(new Error('network'));
    fireEvent.change(slotInput('outside'), { target: { files: [photoFile()] } });
    expect(
      await screen.findByText('The upload did not go through. Check your network and try again.'),
    ).toBeInTheDocument();
  });

  it('takes the words away when the next photo goes through', async () => {
    show(makeCollect(0));
    h.photo.mutateAsync.mockRejectedValueOnce(new ImageRejected('size'));
    box();
    fireEvent.change(slotInput('outside'), { target: { files: [photoFile()] } });
    await screen.findByText(/too big/);
    fireEvent.change(slotInput('outside'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(screen.queryByText(/too big/)).toBeNull());
  });
});

describe("DeclarationsBox — collect: the owner's word and Send", () => {
  it('has the checkbox, unticked, as a 44px row', () => {
    show(makeCollect(2));
    box();
    expect(tick()).not.toBeChecked();
    expect(tick().closest('label')!.className).toContain('min-h-11');
  });

  it('keeps Send off until both photos are in AND the box is ticked', () => {
    // Neither.
    show(makeCollect(0));
    const first = box();
    expect(sendButton()).toBeDisabled();
    expect(sendButton().className).toContain('min-h-11');
    // Ticked, no photos.
    fireEvent.click(tick());
    expect(sendButton()).toBeDisabled();
    first.unmount();

    // One photo, ticked.
    show(makeCollect(1));
    const second = box();
    fireEvent.click(tick());
    expect(sendButton()).toBeDisabled();
    second.unmount();

    // Both photos, not ticked.
    show(makeCollect(2));
    box();
    expect(sendButton()).toBeDisabled();
    // Both, ticked.
    fireEvent.click(tick());
    expect(sendButton()).toBeEnabled();
    // Unticked again.
    fireEvent.click(tick());
    expect(sendButton()).toBeDisabled();
  });

  it('says what is missing under a Send that is off, and says nothing under one that is on', () => {
    const needs = 'To send, add both photos and tick the box above.';
    const tickLine = 'Done. Now tick the box and press Send.';
    // One photo: the photos are what is missing.
    show(makeCollect(1));
    const first = box();
    expect(screen.getByText(needs)).toBeInTheDocument();
    expect(screen.queryByText(tickLine)).toBeNull();
    first.unmount();

    // Both photos, no tick: only the tick is missing, and the line says so.
    show(makeCollect(2));
    box();
    expect(screen.getByText(tickLine)).toBeInTheDocument();
    expect(screen.queryByText(needs)).toBeNull();
    fireEvent.click(tick());
    expect(screen.queryByText(needs)).toBeNull();
    expect(screen.queryByText(tickLine)).toBeNull();
  });

  it("Send posts the step with the owner's word, in the shape the server accepts", async () => {
    show(makeCollect(2));
    box();
    fireEvent.click(tick());
    fireEvent.click(sendButton());
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'send', confirmFresh: true });
    expect(h.photo.mutateAsync).not.toHaveBeenCalled();
  });

  it('asks for the word again when a photo is retaken', () => {
    show(makeCollect(2));
    const { rerender } = box();
    fireEvent.click(tick());
    expect(sendButton()).toBeEnabled();

    // The same pair again (the view was read again): the word stands.
    show(makeCollect(2));
    rerender(<DeclarationsBox />);
    expect(tick()).toBeChecked();

    // A new photo in the outside slot: the word no longer covers what is there.
    show(
      makeDeclarationsView({
        screen: 'collect',
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: [
            makeWashroomPhoto('outside', { key: 'declarations/d1/uploads/retaken.jpg' }),
            makeWashroomPhoto('inside'),
          ],
        }),
      }),
    );
    rerender(<DeclarationsBox />);
    expect(tick()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });

  it("shows the box's own words when Send is refused, and keeps the photos where they are", async () => {
    show(makeCollect(2));
    h.answer.mutateAsync.mockRejectedValue(
      new ApiError(
        409,
        'CONFLICT',
        'The photos have already been sent. MDG is filing the declaration.',
      ),
    );
    box();
    fireEvent.click(tick());
    fireEvent.click(sendButton());
    expect(
      await screen.findByText('The photos are already sent. MDG is filing it.'),
    ).toBeInTheDocument();
    expect(slotBox('outside')).toBeInTheDocument();
  });

  it("puts a refusal in Hindi for a Hindi reader, never the server's English", async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(makeCollect(2));
    h.answer.mutateAsync.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'That just changed. Try again.'),
    );
    const { container } = box();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'ये फ़ोटो आज मेरे अपने वॉशरूम की खींची गई हैं' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'भेजें' }));
    expect(await screen.findByText(/अभी कुछ बदल गया है/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/That just changed/);
  });

  it('speaks Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(makeCollect(0));
    box();
    expect(
      screen.getByText(/इंडियन ऑयल को इस हफ़्ते आपके वॉशरूम की 2 फ़ोटो चाहिए/),
    ).toBeInTheDocument();
    expect(screen.getByText('1. वॉशरूम के बाहर से')).toBeInTheDocument();
    expect(screen.getByText('2. वॉशरूम के अंदर से')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'ये फ़ोटो आज मेरे अपने वॉशरूम की खींची गई हैं' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'भेजें' })).toBeDisabled();
  });
});

describe('DeclarationsBox — collect: the same photos as last time', () => {
  /** Collecting, last time's two photos on offer, and the box holding `held` of this week's. */
  const withLast = (held: 0 | 1 | 2 = 0, over: Partial<DeclarationsView> = {}) =>
    makeCollect(held, {
      lastPhotos: makeLastPhotos(),
      lastWashroomFiledDay: '2026-11-05',
      ...over,
    });
  /** The same screen after the server put last time's photos in both slots, dated today. */
  const afterReuse = (over: Partial<DeclarationsView> = {}) =>
    withLast(0, {
      washroom: makeWashroomCycle({
        state: 'collecting',
        photos: makeLastPhotos({ at: new Date().toISOString(), reused: true }),
      }),
      ...over,
    });
  const card = () => document.querySelector<HTMLElement>('[data-declarations-reuse]');
  // A spinner inside the button adds its own word to the name while it is working.
  const reuseButton = () => screen.getByRole('button', { name: /Use the same photos$/ });
  const sameWords = 'My washroom still looks like it does in these photos';
  const todayWords = 'These photos were taken today of my own washroom';

  it('shows no card when there is nothing from last time, or only one photo of it', () => {
    show(makeCollect(0));
    const first = box();
    expect(card()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use the same photos' })).toBeNull();
    expect(screen.queryByText('Or take new photos')).toBeNull();
    first.unmount();

    show(makeCollect(0, { lastPhotos: makeLastPhotos().slice(0, 1) }));
    box();
    expect(card()).toBeNull();
    // The two slots are all there is, as before.
    expect(slotBox('outside')).toBeInTheDocument();
    expect(slotBox('inside')).toBeInTheDocument();
  });

  it('shows the card on top when both of last time’s photos are there: title, day, two labelled photos, one button', () => {
    show(withLast(0));
    box();
    const c = within(card()!);
    expect(c.getByText("Last time's photos")).toBeInTheDocument();
    expect(c.getByText('Sent on 05-11-2026')).toBeInTheDocument();
    // Outside, then inside, each a picture that opens full size.
    const photos = [...card()!.querySelectorAll('[data-last-photo]')];
    expect(photos.map((el) => el.getAttribute('data-last-photo'))).toEqual(['outside', 'inside']);
    expect(c.getByRole('img', { name: 'Outside' })).toHaveAttribute(
      'src',
      'https://files.example.test/last-outside.jpg',
    );
    expect(c.getByRole('img', { name: 'Inside' })).toHaveAttribute(
      'src',
      'https://files.example.test/last-inside.jpg',
    );
    // Each opens full size in the app, as a button.
    expect(c.getByRole('button', { name: 'Outside' })).toBeInTheDocument();
    expect(c.getByRole('button', { name: 'Inside' })).toBeInTheDocument();
    expect(card()!.querySelector('a')).toBeNull();
    // ONE action button in the card, and it is the big one; the other two only open a photo
    // (the thumbnails, labelled with the photo's name).
    const actions = c
      .getAllByRole('button')
      .filter((b) => !['Outside', 'Inside'].includes(b.getAttribute('aria-label') ?? ''));
    expect(actions).toEqual([reuseButton()]);
    expect(reuseButton().className).toContain('min-h-11');
    // The headline stays on top, the card is above the slots, and the way to take new photos is right under it.
    const slots = document.querySelector('[data-photo-slot="outside"]')!;
    const orNew = screen.getByText('Or take new photos');
    const headline = screen.getByText('IndianOil needs 2 photos of your washroom this week:');
    expect(
      headline.compareDocumentPosition(card()!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(card()!.compareDocumentPosition(orNew) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(orNew.compareDocumentPosition(slots) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Taking new photos works exactly as before.
    expect(within(slotBox('outside')).getByText('Take or choose a photo')).toBeInTheDocument();
    expect(slotInput('outside')).not.toBeDisabled();
  });

  it('falls back to the day on the photo when the view has no filing day, and omits it when it has neither', () => {
    show(withLast(0, { lastWashroomFiledDay: null }));
    const first = box();
    expect(within(card()!).getByText('Sent on 05-11-2026')).toBeInTheDocument();
    first.unmount();

    show(
      withLast(0, { lastWashroomFiledDay: null, lastPhotos: makeLastPhotos({ at: 'garbage' }) }),
    );
    box();
    expect(within(card()!).queryByText(/Sent on/)).toBeNull();
  });

  it('one tap puts both photos back with ONE request, and posts nothing else', async () => {
    show(withLast(0));
    box();
    fireEvent.click(reuseButton());
    await waitFor(() => expect(h.reuse.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.reuse.mutateAsync).toHaveBeenCalledWith();
    expect(h.photo.mutateAsync).not.toHaveBeenCalled();
    expect(h.answer.mutateAsync).not.toHaveBeenCalled();
  });

  it('after it, both slots read as added with the mark, each can be retaken, and the card is gone', () => {
    show(afterReuse());
    box();
    expect(card()).toBeNull();
    expect(screen.queryByText('Or take new photos')).toBeNull();
    for (const slot of ['outside', 'inside'] as const) {
      const el = slotBox(slot);
      expect(within(el).getByText('Added')).toBeInTheDocument();
      expect(within(el).getByText('Same as last time')).toBeInTheDocument();
      expect(el).not.toHaveAttribute('data-photo-stale');
      expect(within(el).getByText('Retake')).toBeInTheDocument();
      expect(slotInput(slot)).not.toBeDisabled();
    }
  });

  it('a retake after it posts the new photo for that slot, like any retake', async () => {
    show(afterReuse());
    box();
    const again = photoFile('again.jpg');
    fireEvent.change(slotInput('inside'), { target: { files: [again] } });
    await waitFor(() => expect(h.photo.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.photo.mutateAsync).toHaveBeenCalledWith({
      dealerId: 'd1',
      slot: 'inside',
      file: again,
    });
  });

  it('only the retaken slot loses the mark, and the card goes: the tap would throw the new photo away', () => {
    const view = afterReuse({
      washroom: makeWashroomCycle({
        state: 'collecting',
        photos: [
          makeWashroomPhoto('outside', { key: 'declarations/d1/files/fresh.jpg' }),
          ...makeLastPhotos({ at: new Date().toISOString(), reused: true }).slice(1),
        ],
      }),
    });
    show(view);
    box();
    expect(within(slotBox('outside')).queryByText('Same as last time')).toBeNull();
    expect(within(slotBox('outside')).getByText('Added')).toBeInTheDocument();
    expect(within(slotBox('inside')).getByText('Same as last time')).toBeInTheDocument();
    expect(card()).toBeNull();
    expect(screen.queryByRole('button', { name: /Use the same photos$/ })).toBeNull();
    expect(screen.queryByText('Or take new photos')).toBeNull();
  });

  it('shows no card for one new photo, or two, however last time’s photos are there', () => {
    for (const held of [1, 2] as const) {
      show(withLast(held));
      const { unmount } = box();
      expect(card()).toBeNull();
      expect(screen.queryByRole('button', { name: /Use the same photos$/ })).toBeNull();
      expect(screen.queryByText('Or take new photos')).toBeNull();
      unmount();
    }
  });

  it('brings the card back when the box is empty again (the photos were dropped)', () => {
    show(withLast(1));
    const { rerender } = box();
    expect(card()).toBeNull();
    show(withLast(0));
    rerender(<DeclarationsBox />);
    expect(card()).not.toBeNull();
  });

  it('says "my washroom still looks like these photos" when EVERY photo in the box is put back', () => {
    show(afterReuse());
    box();
    expect(screen.getByRole('checkbox', { name: sameWords })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: todayWords })).toBeNull();
  });

  it('says "still looks like these photos" when only ONE photo is put back and the other is new', () => {
    // The owner put both back, then retook only the outside photo (or only the inside one):
    // "taken today" would be false of the put-back one, so the other sentence stays.
    for (const fresh of ['outside', 'inside'] as const) {
      const [outside, inside] = makeLastPhotos({ at: new Date().toISOString(), reused: true });
      show(
        afterReuse({
          washroom: makeWashroomCycle({
            state: 'collecting',
            photos: [
              fresh === 'outside' ? makeWashroomPhoto('outside') : outside!,
              fresh === 'inside' ? makeWashroomPhoto('inside') : inside!,
            ],
          }),
        }),
      );
      const { unmount } = box();
      expect(screen.getByRole('checkbox', { name: sameWords })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: todayWords })).toBeNull();
      unmount();
    }
  });

  it('keeps "taken today" for photos that are all new, and when the box is empty', () => {
    show(makeCollect(2));
    const first = box();
    expect(screen.getByRole('checkbox', { name: todayWords })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: sameWords })).toBeNull();
    first.unmount();

    show(withLast(0));
    box();
    expect(screen.getByRole('checkbox', { name: todayWords })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: sameWords })).toBeNull();
  });

  it('switches the sentence with the photos, and takes the tick back each time', () => {
    show(afterReuse());
    const { rerender } = box();
    fireEvent.click(screen.getByRole('checkbox', { name: sameWords }));
    expect(sendButton()).toBeEnabled();

    // A new photo in the outside slot: the put-back inside photo is still in the box, so the
    // sentence stays, and the tick is asked for again.
    const retaken = makeWashroomPhoto('outside', { key: 'declarations/d1/uploads/retaken.jpg' });
    const putBackInside = makeLastPhotos({ at: new Date().toISOString(), reused: true })[1]!;
    show(
      afterReuse({
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: [retaken, putBackInside],
        }),
      }),
    );
    rerender(<DeclarationsBox />);
    expect(screen.getByRole('checkbox', { name: sameWords })).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: sameWords }));
    expect(sendButton()).toBeEnabled();

    // Both retaken: nothing put back is left, so the sentence is the old one, unticked.
    show(
      afterReuse({
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: [
            retaken,
            makeWashroomPhoto('inside', { key: 'declarations/d1/uploads/retaken-in.jpg' }),
          ],
        }),
      }),
    );
    rerender(<DeclarationsBox />);
    expect(screen.getByRole('checkbox', { name: todayWords })).not.toBeChecked();
    expect(sendButton()).toBeDisabled();

    // The same photos put back again: the other sentence, unticked again.
    show(afterReuse());
    rerender(<DeclarationsBox />);
    expect(screen.getByRole('checkbox', { name: sameWords })).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });

  it('Send works on put-back photos once the word is given, in the shape the server accepts', async () => {
    show(afterReuse());
    box();
    expect(sendButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: sameWords }));
    expect(sendButton()).toBeEnabled();
    fireEvent.click(sendButton());
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'send', confirmFresh: true });
  });

  it('does not count photos put back on an earlier day: they are asked for again, and the card is still there to do it', () => {
    show(
      withLast(0, {
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: makeLastPhotos({ at: '2026-11-02T05:00:00.000Z', reused: true }),
        }),
      }),
    );
    box();
    fireEvent.click(screen.getByRole('checkbox', { name: sameWords }));
    expect(sendButton()).toBeDisabled();
    expect(slotBox('outside')).toHaveAttribute('data-photo-stale');
    expect(card()).not.toBeNull();
  });

  it('tells the owner a photo put back on an earlier day is dated again by the same button', () => {
    show(
      withLast(0, {
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: makeLastPhotos({ at: '2026-11-02T05:00:00.000Z', reused: true }),
        }),
      }),
    );
    box();
    for (const slot of ['outside', 'inside'] as const) {
      expect(
        within(slotBox(slot)).getByText(
          'Put back on 02-11-2026. Tap "Use the same photos" again, or take a new photo.',
        ),
      ).toBeInTheDocument();
      // Not the plain line that only says to take it again.
      expect(within(slotBox(slot)).queryByText(/Please take it again today/)).toBeNull();
    }
    // …and the button it points at is on the screen.
    expect(reuseButton()).toBeInTheDocument();
  });

  it('says the same in Hindi first, with the button’s own Hindi label', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(
      withLast(0, {
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: makeLastPhotos({ at: '2026-11-02T05:00:00.000Z', reused: true }),
        }),
      }),
    );
    box();
    expect(
      within(slotBox('outside')).getByText(
        '02-11-2026 को लगाई थी। "यही फ़ोटो फिर से लगाइए" फिर से दबाइए, या नई फ़ोटो लीजिए।',
      ),
    ).toBeInTheDocument();
  });

  it('does not point at a button that is not there: a new photo beside an old put-back one gets the plain line', () => {
    const [, insideOld] = makeLastPhotos({ at: '2026-11-02T05:00:00.000Z', reused: true });
    show(
      withLast(0, {
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: [makeWashroomPhoto('outside'), insideOld!],
        }),
      }),
    );
    box();
    expect(card()).toBeNull();
    expect(
      within(slotBox('inside')).getByText('Added on 02-11-2026. Please take it again today.'),
    ).toBeInTheDocument();
    expect(within(slotBox('inside')).queryByText(/Tap "Use the same photos"/)).toBeNull();
  });

  it('says Send is still to be pressed once both photos are in and only the tick is missing', () => {
    const needs = 'To send, add both photos and tick the box above.';
    const tickLine = 'Done. Now tick the box and press Send.';
    show(afterReuse());
    box();
    // The tap filled both slots and sent nothing: the line says so, and does not ask for photos.
    expect(screen.getByText(tickLine)).toBeInTheDocument();
    expect(screen.queryByText(needs)).toBeNull();
    expect(h.answer.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: sameWords }));
    expect(screen.queryByText(tickLine)).toBeNull();
    expect(screen.queryByText(needs)).toBeNull();
    expect(sendButton()).toBeEnabled();
  });

  it('keeps "add both photos" while a photo is missing, and says the new line in Hindi first', () => {
    show(withLast(1));
    const first = box();
    expect(
      screen.getByText('To send, add both photos and tick the box above.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Done. Now tick the box and press Send.')).toBeNull();
    first.unmount();

    useLangStore.setState({ lang: 'hi', explicit: false });
    show(afterReuse());
    box();
    expect(screen.getByText('हो गया। अब डिब्बा टिक करके भेजें दबाइए।')).toBeInTheDocument();
  });

  it('turns every control off while the tap is on its way, and shows it on the button', () => {
    show(withLast(0));
    h.busy = { busy: true, uploadingSlot: null, reusing: true };
    box();
    expect(reuseButton()).toBeDisabled();
    expect(reuseButton()).toHaveAttribute('aria-busy', 'true');
    expect(reuseButton().querySelector('svg.animate-spin')).not.toBeNull();
    expect(slotInput('outside')).toBeDisabled();
    expect(slotInput('inside')).toBeDisabled();
    // Send is not the button that is working.
    expect(sendButton().querySelector('svg.animate-spin')).toBeNull();
  });

  it('keeps the card, off, while something else is on its way', () => {
    show(withLast(0));
    h.busy = { busy: true, uploadingSlot: 'outside', reusing: false };
    box();
    expect(reuseButton()).toBeDisabled();
    expect(reuseButton()).toHaveAttribute('aria-busy', 'false');
    expect(reuseButton().querySelector('svg.animate-spin')).toBeNull();
  });

  describe('when it does not go through', () => {
    const tap = async () => {
      show(withLast(0));
      box();
      fireEvent.click(reuseButton());
    };

    it("shows the server's refusal as it is, Hindi first with the English after", async () => {
      const gone =
        'पिछली बार की फ़ोटो अब हमारे पास नहीं हैं। कृपया नई फ़ोटो भेजिए। (The photos from last time are gone. Please send new photos.)';
      h.reuse.mutateAsync.mockRejectedValue(new ApiError(400, 'BAD', gone));
      await tap();
      expect(await screen.findByText(gone)).toBeInTheDocument();
      // The slots are still there to take new photos with.
      expect(slotInput('outside')).not.toBeDisabled();
    });

    it('says "something just changed" for a refusal it has no words for, never the server’s English', async () => {
      h.reuse.mutateAsync.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Not now.'));
      await tap();
      expect(
        await screen.findByText(
          'Something just changed. Look at the box again, then try once more.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('Not now.')).toBeNull();
    });

    it('says it could not save for a dropped connection or a server fault', async () => {
      h.reuse.mutateAsync.mockRejectedValueOnce(new Error('network'));
      await tap();
      expect(await screen.findByText("Couldn't save — try again")).toBeInTheDocument();
    });

    it('takes the words away when the screen moves on', async () => {
      h.reuse.mutateAsync.mockRejectedValueOnce(new Error('network'));
      show(withLast(0));
      const { rerender } = box();
      fireEvent.click(reuseButton());
      await screen.findByText("Couldn't save — try again");
      show(makeDeclarationsView({ screen: 'waiting' }));
      rerender(<DeclarationsBox />);
      await waitFor(() => expect(screen.queryByText("Couldn't save — try again")).toBeNull());
    });
  });

  it('speaks Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(withLast(0));
    const first = box();
    const c = within(card()!);
    expect(c.getByText('पिछली बार की फ़ोटो')).toBeInTheDocument();
    expect(c.getByText('05-11-2026 को भेजी थीं')).toBeInTheDocument();
    expect(c.getByText('बाहर से')).toBeInTheDocument();
    expect(c.getByText('अंदर से')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'यही फ़ोटो फिर से लगाइए' })).toBeInTheDocument();
    expect(screen.getByText('या नई फ़ोटो लीजिए')).toBeInTheDocument();
    first.unmount();

    show(afterReuse());
    box();
    expect(within(slotBox('outside')).getByText('पिछली बार वाली')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'मेरा वॉशरूम अभी भी वैसा ही है जैसा इन फ़ोटो में दिख रहा है',
      }),
    ).toBeInTheDocument();
  });
});


describe('DeclarationsBox — a photo from an earlier day', () => {
  /** Monday's outside photo, today's inside photo. */
  const mondayAndToday = () =>
    makeDeclarationsView({
      screen: 'collect',
      washroom: makeWashroomCycle({
        state: 'collecting',
        photos: [
          makeWashroomPhoto('outside', { at: '2026-11-02T05:00:00.000Z' }),
          makeWashroomPhoto('inside'),
        ],
      }),
    });

  it('does not call it added: it says when it was added and asks for it again today', () => {
    show(mondayAndToday());
    box();
    const outside = slotBox('outside');
    expect(
      within(outside).getByText('Added on 02-11-2026. Please take it again today.'),
    ).toBeInTheDocument();
    expect(within(outside).queryByText('Added')).toBeNull();
    expect(outside).toHaveAttribute('data-photo-stale');
    // The photo itself is still there to look at, and can be retaken.
    expect(within(outside).getByRole('img', { name: '1. From outside' })).toBeInTheDocument();
    expect(within(outside).getByText('Retake')).toBeInTheDocument();
    // Today's photo is added as usual.
    const inside = slotBox('inside');
    expect(within(inside).getByText('Added')).toBeInTheDocument();
    expect(inside).not.toHaveAttribute('data-photo-stale');
  });

  it('keeps Send off however the box is ticked, and says what is needed', () => {
    show(mondayAndToday());
    box();
    fireEvent.click(tick());
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText('To send, add both photos and tick the box above.'),
    ).toBeInTheDocument();
  });

  it('allows Send once the old photo is taken again today', () => {
    show(mondayAndToday());
    const { rerender } = box();
    fireEvent.click(tick());
    expect(sendButton()).toBeDisabled();
    // The retake lands: the view now holds today's pair (a new key, so the tick is asked for again).
    show(
      makeDeclarationsView({
        screen: 'collect',
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: [
            makeWashroomPhoto('outside', { key: 'declarations/d1/uploads/retaken.jpg' }),
            makeWashroomPhoto('inside'),
          ],
        }),
      }),
    );
    rerender(<DeclarationsBox />);
    expect(tick()).not.toBeChecked();
    fireEvent.click(tick());
    expect(sendButton()).toBeEnabled();
  });

  it('says it in Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    show(mondayAndToday());
    box();
    expect(
      within(slotBox('outside')).getByText('02-11-2026 को डाली थी। आज दोबारा खींचिए।'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'भेजें' })).toBeDisabled();
  });
});

describe('DeclarationsBox — after sending', () => {
  it('waiting: says the photos arrived and MDG is filing them, with no button', () => {
    show(
      makeDeclarationsView({
        screen: 'waiting',
        washroom: makeWashroomCycle({ state: 'ready', photos: makeCollect(2).washroom.photos }),
      }),
    );
    box();
    expect(screen.getByRole('status')).toHaveTextContent(
      "Photos received. MDG is filing it on IndianOil's portal.",
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });

  it('done: says it is filed, with the day', () => {
    show(makeDeclarationsView({ screen: 'done', lastWashroomFiledDay: '2026-11-12' }));
    box();
    expect(screen.getByText("Filed on IndianOil's portal on 12-11-2026.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('done: still reads well with no day', () => {
    show(makeDeclarationsView({ screen: 'done' }));
    box();
    expect(screen.getByText("Filed on IndianOil's portal.")).toBeInTheDocument();
  });

  it("failed: two plain sentences, no button, and none of the server's own words", () => {
    show(
      makeDeclarationsView({
        screen: 'failed',
        washroom: makeWashroomCycle({
          state: 'failed',
          failure: 'The portal answered with code 77 on the toilet page.',
        }),
      }),
    );
    const { container } = box();
    expect(
      screen.getByText('MDG could not file it. Our team is looking into it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.textContent).not.toMatch(/code 77|toilet page/);
  });

  it('speaks Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    for (const [view, words] of [
      [makeDeclarationsView({ screen: 'waiting' }), /फ़ोटो मिल गईं/],
      [makeDeclarationsView({ screen: 'done', lastWashroomFiledDay: '2026-11-12' }), /12-11-2026/],
      [makeDeclarationsView({ screen: 'failed' }), /हमारी टीम इसे देख रही है/],
    ] as const) {
      show(view);
      const { unmount } = box();
      expect(screen.getByText(words)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('DeclarationsBox — what the owner never sees', () => {
  it("draws nothing of the admin's pane even if the view arrives with it", () => {
    const adminShaped = {
      ...makeCollect(2),
      statuses: [
        { kind: 'branded', todo: 'Branded Fuels is not filled. An admin must fill it by hand.' },
        { kind: 'safety', lastReply: 'Safety declaration submitted successfully' },
      ],
      history: [{ summary: 'Safety declaration filed for 12-11-2026', portalReply: 'OK 200' }],
      runs: [{ id: 'run-1', summary: 'swept' }],
      config: { feedbackText: 'NA', placeOfDeclaration: 'Patna' },
    } as unknown as DeclarationsView;
    show(adminShaped);
    const { container } = box();
    expect(container.textContent).not.toMatch(
      /Branded|Safety declaration|by hand|OK 200|swept|Patna|feedback/i,
    );
  });

  it('never says "Sir", "SDMS", "robot" or a technical id, on any screen, in either language', () => {
    const views = [
      makeDeclarationsView({
        lastWashroomFiledDay: '2026-11-05',
        nextWashroomDueDay: '2026-11-12',
      }),
      makeCollect(0),
      makeCollect(2),
      makeCollect(0, { lastPhotos: makeLastPhotos(), lastWashroomFiledDay: '2026-11-05' }),
      makeCollect(0, {
        lastPhotos: makeLastPhotos(),
        washroom: makeWashroomCycle({
          state: 'collecting',
          photos: makeLastPhotos({ at: new Date().toISOString(), reused: true }),
        }),
      }),
      makeDeclarationsView({ screen: 'waiting' }),
      makeDeclarationsView({ screen: 'done', lastWashroomFiledDay: '2026-11-12' }),
      makeDeclarationsView({ screen: 'failed' }),
      makeDeclarationsView({ active: false }),
    ];
    for (const lang of ['en', 'hi'] as const) {
      useLangStore.setState({ lang, explicit: false });
      for (const view of views) {
        show(view);
        const { container, unmount } = box();
        expect(container.textContent).not.toMatch(
          /\bSir\b|SDMS|robot|\be\d{1,2}\b|\b[A-Z]{2,}-\d/i,
        );
        unmount();
      }
    }
  });
});
