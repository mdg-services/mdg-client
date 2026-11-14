import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from '@/features/chat/MessageBubble';
import { ApiError } from '@/lib/api';
import { LONG_PRESS_MS } from '@/lib/useLongPress';
import { useLangStore } from '@/store/lang';
import {
  makeAnswer,
  makeOutletDetailsView,
  makeQuestion,
  makeStateQuestion,
  saved,
} from '@/test/outletDetailsFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import { saveOutletDetailsSchema } from '@dk/shared/schemas';
import type { OutletDetailsView } from '@dk/shared/types';

import { outletDetailsKey } from './useOutletDetails';

// The server is a double; ApiError stays the real one, so the card tells a 404
// from any other failure the way it does in the app.
const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put },
}));

const PATH = '/v1/me/outlet-details';

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
  h.get.mockReset();
  h.put.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function form(view: OutletDetailsView | Error, over: { onLongPress?: () => void } = {}) {
  if (view instanceof Error) h.get.mockRejectedValue(view);
  else h.get.mockResolvedValue(view);
  const message = makeMessage({
    id: 'details-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'Please fill in your pump details.',
    outletDetails: {},
  });
  return renderWithProviders(
    <MessageBubble message={message} mine={false} onLongPress={over.onLongPress} />,
  );
}

const box = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>('[data-setup-card="outlet-details"]');
  if (!el) throw new Error('no pump details box');
  return el;
};
const row = (id: string): HTMLElement => {
  const el = box().querySelector<HTMLElement>(`[data-question="${id}"]`);
  if (!el) throw new Error(`no question ${id}`);
  return el;
};
const optionTexts = (select: HTMLElement) =>
  within(select).getAllByRole('option').map((o) => o.textContent);

/** A save that answers with the view as the server would hold it afterwards. */
function serverSaves(next: OutletDetailsView) {
  h.put.mockResolvedValue(next);
}

describe('the Pump details box in a message', () => {
  it('draws title, intro and the question under the message words, and asks only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    cleanup();

    const { container } = form(makeOutletDetailsView());
    expect(await screen.findByText('Pump details')).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith(PATH);
    expect(screen.getByText('Please tell us a few things.')).toBeInTheDocument();
    expect(screen.getByText('Which state is your pump in?')).toBeInTheDocument();
    const words = screen.getByText('Please fill in your pump details.');
    expect(words.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // As wide as the other boxes, with its time on its own line.
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
  });

  it('shares its answer with the cache key every form in the thread draws from', async () => {
    const { queryClient } = form(makeOutletDetailsView());
    await screen.findByText('Pump details');
    expect(queryClient.getQueryData(outletDetailsKey)).toBeTruthy();
  });

  it('never lets a finger held on the box select the message', async () => {
    const onLongPress = vi.fn();
    form(makeOutletDetailsView(), { onLongPress });
    await screen.findByText('Pump details');
    expect(box()).toHaveAttribute('data-no-swipe');
    fireEvent.pointerDown(screen.getByLabelText(/Which state/), { pointerId: 1, clientX: 5, clientY: 5 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60));
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('draws nothing at all when the server has no such route (404)', async () => {
    form(new ApiError(404, 'HTTP_404', 'Not found'));
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('[data-setup-card]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Please fill in your pump details.')).toBeInTheDocument();
  });

  it('says so, and offers a retry, when the form cannot be had', async () => {
    form(new ApiError(500, 'INTERNAL', 'boom'));
    await screen.findByText("Couldn't load this just now");
    h.get.mockResolvedValue(makeOutletDetailsView());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pump details')).toBeInTheDocument();
  });
});

describe('each kind of question is drawn from what the server sent', () => {
  const everyKind = makeOutletDetailsView({
    questions: [
      makeStateQuestion(),
      makeQuestion('size', 'choice', {
        label: { hi: 'आकार', en: 'Size' },
        options: [
          { value: 's', label: { hi: 'छोटा', en: 'Small' } },
          { value: 'm', label: { hi: 'मध्यम', en: 'Medium' } },
          { value: 'l', label: { hi: 'बड़ा', en: 'Large' } },
        ],
      }),
      makeQuestion('region', 'choice', {
        label: { hi: 'इलाका', en: 'Region' },
        options: ['a', 'b', 'c', 'd', 'e'].map((v) => ({
          value: v,
          label: { hi: `इलाका ${v}`, en: `Region ${v}` },
        })),
      }),
      makeQuestion('night', 'yesno', { label: { hi: 'रात में खुला?', en: 'Open at night?' } }),
      makeQuestion('note', 'text', {
        label: { hi: 'टिप्पणी', en: 'Note' },
        help: { hi: 'कुछ भी लिखिए', en: 'Write anything' },
        placeholder: { hi: 'यहाँ लिखिए', en: 'Write here' },
        maxLength: 80,
      }),
      makeQuestion('tanks', 'number', {
        label: { hi: 'टंकियाँ', en: 'Tanks' },
        placeholder: { hi: 'कितनी', en: 'How many' },
        min: 1,
        max: 12,
      }),
      makeQuestion('since', 'date', { label: { hi: 'शुरू', en: 'Started' } }),
    ],
  });

  it('draws a state as a list in the English alphabet, an up-to-four choice as buttons, a longer one as a list', async () => {
    form(everyKind);
    await screen.findByText('Pump details');

    const state = within(row('pump_state')).getByRole('combobox');
    expect(optionTexts(state)).toEqual(['Choose', 'Bihar', 'Delhi', 'Haryana', 'Maharashtra']);

    const size = row('size');
    expect(within(size).getAllByRole('button').map((b) => b.textContent)).toEqual(['Small', 'Medium', 'Large']);
    expect(within(size).queryByRole('combobox')).toBeNull();

    const region = within(row('region')).getByRole('combobox');
    expect(optionTexts(region)).toEqual(['Choose', 'Region a', 'Region b', 'Region c', 'Region d', 'Region e']);
  });

  it('draws yes/no as two buttons, text, number and date as boxes with the right keyboards', async () => {
    form(everyKind);
    await screen.findByText('Pump details');

    expect(within(row('night')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Yes', 'No']);

    const note = within(row('note')).getByRole('textbox');
    expect(note).toHaveAttribute('placeholder', 'Write here');
    expect(note).toHaveAttribute('maxlength', '80');
    expect(within(row('note')).getByText('Write anything')).toBeInTheDocument();

    const tanks = within(row('tanks')).getByPlaceholderText('How many');
    expect(tanks).toHaveAttribute('inputmode', 'numeric');
    expect(tanks).toHaveAttribute('type', 'number');
    expect(tanks).toHaveAttribute('min', '1');
    expect(tanks).toHaveAttribute('max', '12');

    const since = row('since').querySelector('input');
    expect(since).toHaveAttribute('type', 'date');
  });

  it('marks a required question plainly and a help line sits under it', async () => {
    form(everyKind);
    await screen.findByText('Pump details');
    expect(within(row('pump_state')).getByText('Required')).toBeInTheDocument();
    expect(within(row('pump_state')).getByText('Bank holidays are set state by state.')).toBeInTheDocument();
    expect(within(row('note')).queryByText('Required')).toBeNull();
  });

  it('draws everything in Hindi with the state as Hindi name and English in brackets, in the Hindi alphabet', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    form(everyKind);
    await screen.findByText('पंप की जानकारी');
    expect(screen.getByText('कुछ बातें बता दीजिए।')).toBeInTheDocument();
    expect(screen.getByText('आपका पंप किस राज्य में है?')).toBeInTheDocument();
    const state = within(row('pump_state')).getByRole('combobox');
    expect(optionTexts(state)).toEqual([
      'चुनिए',
      'दिल्ली (Delhi)',
      'बिहार (Bihar)',
      'महाराष्ट्र (Maharashtra)',
      'हरियाणा (Haryana)',
    ]);
    expect(within(row('night')).getAllByRole('button').map((b) => b.textContent)).toEqual(['हाँ', 'नहीं']);
    expect(within(row('pump_state')).getByText('ज़रूरी है')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'सेव करें' })).toBeInTheDocument();
  });

  it('shows a kind it has never heard of as its label and saved value, and does not crash', async () => {
    form(
      makeOutletDetailsView({
        questions: [
          makeStateQuestion({ answer: saved('06') }),
          makeQuestion('x', 'hologram', { label: { hi: 'नया', en: 'Brand new' }, answer: saved('beam') }),
          makeQuestion('y', 'hologram', { label: { hi: 'और नया', en: 'Newer still' } }),
        ],
        complete: false,
      }),
    );
    await screen.findByText('Pump details');
    expect(within(row('x')).getByText('Brand new')).toBeInTheDocument();
    expect(within(row('x')).getByText('beam')).toBeInTheDocument();
    expect(within(row('y')).getByText('Not answered')).toBeInTheDocument();
    // And the rest of the form still works.
    expect(within(row('pump_state')).getByRole('combobox')).toHaveValue('06');
  });
});

describe('saving', () => {
  it('pre-selects the suggested state without answering it, says so, and saves it only on Save', async () => {
    form(makeOutletDetailsView({ questions: [makeStateQuestion({ answer: makeAnswer({ suggested: '27' }) })] }));
    await screen.findByText('Pump details');
    expect(within(row('pump_state')).getByRole('combobox')).toHaveValue('27');
    expect(screen.getByText('Suggested — press Save to confirm')).toBeInTheDocument();
    expect(h.put).not.toHaveBeenCalled();

    const done = makeOutletDetailsView({
      questions: [makeStateQuestion({ answer: saved('27') })],
    });
    serverSaves(done);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.put).toHaveBeenCalledTimes(1));
    expect(h.put).toHaveBeenCalledWith(PATH, { answers: { pump_state: '27' } });
    expect(saveOutletDetailsSchema.safeParse(h.put.mock.calls[0]![1]).success).toBe(true);
  });

  it('drops the suggestion line once the dealer picks another state', async () => {
    form(makeOutletDetailsView({ questions: [makeStateQuestion({ answer: makeAnswer({ suggested: '27' }) })] }));
    await screen.findByText('Pump details');
    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '10' } });
    expect(screen.queryByText('Suggested — press Save to confirm')).toBeNull();
  });

  it('sends only what changed, a number as a number, and then shows "Saved" with each answer as plain text and Change', async () => {
    const before = makeOutletDetailsView({
      questions: [
        makeStateQuestion(),
        makeQuestion('note', 'text', { label: { hi: 'टिप्पणी', en: 'Note' } }),
        makeQuestion('tanks', 'number', { label: { hi: 'टंकियाँ', en: 'Tanks' } }),
        makeQuestion('night', 'yesno', { label: { hi: 'रात में खुला?', en: 'Open at night?' } }),
        makeQuestion('size', 'choice', {
          label: { hi: 'आकार', en: 'Size' },
          options: [
            { value: 's', label: { hi: 'छोटा', en: 'Small' } },
            { value: 'l', label: { hi: 'बड़ा', en: 'Large' } },
          ],
        }),
        makeQuestion('since', 'date', { label: { hi: 'शुरू', en: 'Started' } }),
      ],
    });
    const after: OutletDetailsView = {
      ...before,
      complete: true,
      questions: [
        makeStateQuestion({ answer: saved('10') }),
        { ...before.questions[1]!, answer: saved('Near the highway') },
        { ...before.questions[2]!, answer: saved(6) },
        { ...before.questions[3]!, answer: saved(true) },
        { ...before.questions[4]!, answer: saved('l') },
        { ...before.questions[5]!, answer: saved('2026-11-05') },
      ],
    };
    const { queryClient } = form(before);
    await screen.findByText('Pump details');

    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '10' } });
    fireEvent.change(within(row('note')).getByRole('textbox'), { target: { value: ' Near the highway ' } });
    fireEvent.change(within(row('tanks')).getByRole('spinbutton'), { target: { value: '6' } });
    fireEvent.click(within(row('night')).getByRole('button', { name: 'Yes' }));
    fireEvent.click(within(row('size')).getByRole('button', { name: 'Large' }));
    fireEvent.change(row('since').querySelector('input')!, { target: { value: '2026-11-05' } });

    serverSaves(after);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.put).toHaveBeenCalledTimes(1));
    expect(h.put).toHaveBeenCalledWith(PATH, {
      answers: {
        pump_state: '10',
        note: 'Near the highway',
        tanks: 6,
        night: true,
        size: 'l',
        since: '2026-11-05',
      },
    });

    // The reply goes straight into the cache, and the form becomes a calm summary.
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(queryClient.getQueryData(outletDetailsKey)).toEqual(after);
    expect(row('pump_state')).toHaveTextContent('Bihar');
    expect(row('note')).toHaveTextContent('Near the highway');
    expect(row('tanks')).toHaveTextContent('6');
    expect(row('night')).toHaveTextContent('Yes');
    expect(row('size')).toHaveTextContent('Large');
    expect(row('since')).toHaveTextContent(/5.*Nov.*2026/);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('Change opens the form again with the saved answers, and a second save sends only the one difference', async () => {
    const view = makeOutletDetailsView({
      questions: [
        makeStateQuestion({ answer: saved('06') }),
        makeQuestion('note', 'text', { answer: saved('old') }),
      ],
    });
    form(view);
    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText('Saved')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    expect(within(row('pump_state')).getByRole('combobox')).toHaveValue('06');
    expect(within(row('note')).getByRole('textbox')).toHaveValue('old');
    // Nothing changed yet, so there is nothing to save.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(within(row('note')).getByRole('textbox'), { target: { value: 'new' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    serverSaves({ ...view, questions: [view.questions[0]!, { ...view.questions[1]!, answer: saved('new') }] });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.put).toHaveBeenCalledWith(PATH, { answers: { note: 'new' } }));
  });

  it('Cancel puts the summary back without saving', async () => {
    form(makeOutletDetailsView({ questions: [makeStateQuestion({ answer: saved('06') })] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(row('pump_state')).toHaveTextContent('Haryana');
    expect(h.put).not.toHaveBeenCalled();
  });

  it('does not make an unanswered optional question block Save', async () => {
    form(
      makeOutletDetailsView({
        questions: [
          makeStateQuestion(),
          makeQuestion('note', 'text'),
          makeQuestion('night', 'yesno'),
        ],
      }),
    );
    await screen.findByText('Pump details');
    // Nothing chosen yet: nothing to save.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '07' } });
    serverSaves(makeOutletDetailsView({ questions: [makeStateQuestion({ answer: saved('07') })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.put).toHaveBeenCalledWith(PATH, { answers: { pump_state: '07' } }));
  });

  it('lets a chosen optional yes/no be taken back, but not a required one', async () => {
    const view = makeOutletDetailsView({
      questions: [
        makeQuestion('night', 'yesno', { answer: saved(true) }),
        makeQuestion('must', 'yesno', { required: true, answer: saved(true) }),
      ],
    });
    form(view);
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    fireEvent.click(within(row('night')).getByRole('button', { name: 'Yes' }));
    fireEvent.click(within(row('must')).getByRole('button', { name: 'Yes' }));
    expect(within(row('night')).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(row('must')).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');
    serverSaves(view);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.put).toHaveBeenCalledWith(PATH, { answers: { night: null } }));
  });

  it('shows the server\'s plain words when it refuses an answer, and keeps what was typed', async () => {
    form(makeOutletDetailsView());
    await screen.findByText('Pump details');
    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '10' } });
    h.put.mockRejectedValue(new ApiError(400, 'OUTLET_DETAIL_INVALID', 'Please pick one of the states in the list.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please pick one of the states in the list.');
    expect(within(row('pump_state')).getByRole('combobox')).toHaveValue('10');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says "Could not save" in our own words when the failure is not the server\'s to explain', async () => {
    form(makeOutletDetailsView());
    await screen.findByText('Pump details');
    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '10' } });
    h.put.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not save');
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });

  it('shows Saving… and holds the form still while the save is on its way', async () => {
    form(makeOutletDetailsView());
    await screen.findByText('Pump details');
    fireEvent.change(within(row('pump_state')).getByRole('combobox'), { target: { value: '10' } });
    let finish!: (v: OutletDetailsView) => void;
    h.put.mockReturnValue(new Promise<OutletDetailsView>((r) => (finish = r)));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const busy = await screen.findByRole('button', { name: /Saving…/ });
    expect(busy).toBeDisabled();
    expect(within(row('pump_state')).getByRole('combobox')).toBeDisabled();
    await act(async () => {
      finish(makeOutletDetailsView({ questions: [makeStateQuestion({ answer: saved('10') })] }));
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});

describe('a manager', () => {
  it('reads the answers, with a line that the owner fills this, and no way to save', async () => {
    signIn({ role: 'dealer-manager', dealerId: 'd1' });
    form(
      makeOutletDetailsView({
        canEdit: false,
        questions: [makeStateQuestion({ answer: saved('10') }), makeQuestion('note', 'text')],
      }),
    );
    await screen.findByText('Pump details');
    expect(row('pump_state')).toHaveTextContent('Bihar');
    expect(row('note')).toHaveTextContent('Not answered');
    expect(screen.getByText('The owner fills this')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('is told the owner fills it even when nothing is answered yet', async () => {
    signIn({ role: 'dealer-manager', dealerId: 'd1' });
    form(makeOutletDetailsView({ canEdit: false }));
    await screen.findByText('Pump details');
    expect(row('pump_state')).toHaveTextContent('Not answered');
    expect(screen.getByText('The owner fills this')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('an old message shows the answers as they are now', () => {
  it('draws a complete form as a summary, and a form that gained a required question as a form again', async () => {
    const complete = makeOutletDetailsView({ questions: [makeStateQuestion({ answer: saved('06') })] });
    const { unmount } = form(complete);
    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument();
    unmount();

    // The server later adds a required question: the same old message asks it.
    form(
      makeOutletDetailsView({
        questions: [makeStateQuestion({ answer: saved('06') }), makeQuestion('pumps', 'number', { required: true })],
      }),
    );
    expect(await screen.findByRole('spinbutton')).toBeInTheDocument();
    expect(within(row('pump_state')).getByRole('combobox')).toHaveValue('06');
  });
});
