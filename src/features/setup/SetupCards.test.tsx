import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from '@/features/chat/MessageBubble';
import { ApiError } from '@/lib/api';
import { LONG_PRESS_MS } from '@/lib/useLongPress';
import { useLangStore } from '@/store/lang';
import { GSTIN_HARYANA, GSTIN_MAHARASHTRA, makeSetupView, makeStrip } from '@/test/setupFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import type { OutletSetupView, SetupBilling, SetupCardKind } from '@dk/shared/types';

import { ServicesCard } from './ServicesCard';

// The server is a double; ApiError stays the real one, so a card tells a 409
// from any other failure the way it does in the app.
const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put },
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.put.mockReset();
});
afterEach(() => cleanup());

function card(kind: SetupCardKind, view: OutletSetupView | Error, body = 'MDG says something.') {
  if (view instanceof Error) h.get.mockRejectedValue(view);
  else h.get.mockResolvedValue(view);
  const message = makeMessage({
    id: `${kind}-msg`,
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body,
    setupCard: { card: kind },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

const box = (kind: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-setup-card="${kind}"]`);
  if (!el) throw new Error(`no ${kind} card`);
  return el;
};

// By the START of its name: a row brought along by another says "Needed with …"
// in its own, and that must not be mistaken for the row it names.
const checkbox = (label: string) =>
  screen.getByRole('checkbox', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });

describe('a setup card in a message', () => {
  it('asks for the outlet only when a card with a body is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    // The welcome is only words (its video is a message of its own), the logins
    // card is the portal login box: neither makes the call.
    for (const kind of ['welcome', 'logins'] as const) {
      card(kind, makeSetupView());
      await Promise.resolve();
      cleanup();
    }
    expect(h.get).not.toHaveBeenCalled();

    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /Daily Sales Report/ });
    expect(h.get).toHaveBeenCalledWith('/v1/me/setup');
  });

  it('draws the words first, then the card, as wide as a request with its time in the flow', async () => {
    const { container } = card('payment', makeSetupView(), 'Your bill has been sent.');
    await screen.findByText(/getting your bill ready/);
    const words = screen.getByText('Your bill has been sent.');
    expect(words.compareDocumentPosition(box('payment')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
  });

  it('a welcome keeps the bubble an ordinary one', async () => {
    const { container } = card('welcome', makeSetupView(), 'Welcome to Dealer Kavach!');
    await Promise.resolve();
    expect(screen.getByText('Welcome to Dealer Kavach!')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('w-[min(80%,330px)]');
    expect(document.querySelector('[data-setup-card]')).toBeNull();
  });

  it('draws nothing for an outlet that is not in onboarding, or is already live', async () => {
    card('services', makeSetupView({ active: false }));
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(document.querySelector('[data-setup-card]')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says so, and offers a retry, when the outlet cannot be had', async () => {
    card('billing', new ApiError(500, 'INTERNAL', 'boom'));
    await screen.findByText("Couldn't load this just now");
    h.get.mockResolvedValue(makeSetupView());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Name on the bill')).toBeInTheDocument();
  });

  it('never lets a finger held on the card select the message (or start a reply swipe)', async () => {
    const onLongPress = vi.fn();
    h.get.mockResolvedValue(makeSetupView());
    renderWithProviders(
      <MessageBubble
        message={makeMessage({
          id: 'card-msg',
          senderId: 'system-user',
          senderRole: 'admin',
          system: true,
          body: 'Choose your services.',
          setupCard: { card: 'services' },
        })}
        mine={false}
        onLongPress={onLongPress}
      />,
    );
    await screen.findByRole('checkbox', { name: /Daily Sales Report/ });
    expect(box('services')).toHaveAttribute('data-no-swipe');

    const hold = async (el: Element) => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5 });
      await act(async () => {
        await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60));
      });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
    };
    await hold(screen.getByRole('checkbox', { name: /Daily Sales Report/ }));
    expect(onLongPress).not.toHaveBeenCalled();
    // The same hold on the words does select it: the card is what is different.
    await hold(screen.getByText('Choose your services.'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe('the services card', () => {
  const LABELS = [
    'Daily Sales Report',
    'Credit & DOD Monitoring',
    'Water ingress testing',
    'TT Density',
    'Load planner',
    'RO supply status',
  ];

  it('lists every service the server offers, in its order, each with what it gives', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /Daily Sales Report/ });
    const rows = [...document.querySelectorAll('[data-service]')];
    expect(rows.map((r) => r.getAttribute('data-service'))).toEqual([
      'dsr-report',
      'credit-dod-monitoring',
      'water-ingress-testing',
      'tt-density',
      'load-planner',
      'ro-supply-status',
    ]);
    LABELS.forEach((label, i) => expect(rows[i]).toHaveTextContent(label));
    expect(rows[0]).toHaveTextContent("the day's sales and the stock in the tanks");
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    // Nothing ticked yet: Save waits, and says why.
    expect(screen.getByRole('button', { name: 'Save my services' })).toBeDisabled();
    expect(screen.getByText('Tick at least one service')).toBeInTheDocument();
  });

  it('draws in Hindi when the app is in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /रोज़ की बिक्री रिपोर्ट/ });
    expect(screen.getByText(/दिन की बिक्री और टंकी का स्टॉक/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'सेवाएँ सेव करें' })).toBeInTheDocument();
  });

  it('has no ▶ for a service with no video yet', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /Daily Sales Report/ });
    expect(screen.queryByRole('button', { name: /Watch the video/ })).toBeNull();
  });

  it('has a ▶ only on a service that has a video, and it plays that one', async () => {
    renderWithProviders(
      <ServicesCard view={makeSetupView()} videos={{ 'tt-density': 'https://files.test/tt.mp4' }} />,
    );
    const play = screen.getByRole('button', { name: 'Watch the video: TT Density' });
    expect(screen.getAllByRole('button', { name: /Watch the video/ })).toHaveLength(1);
    expect(document.querySelector('video')).toBeNull();
    fireEvent.click(play);
    expect(document.querySelector('video')).toHaveAttribute('src', 'https://files.test/tt.mp4');
    // Tapping the ▶ does not tick the row.
    expect(checkbox('TT Density')).not.toBeChecked();
    fireEvent.click(play);
    expect(document.querySelector('video')).toBeNull();
  });

  it('ticking one that needs another ticks that too, and says why', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /Load planner/ });
    fireEvent.click(checkbox('Load planner'));
    expect(checkbox('Load planner')).toBeChecked();
    expect(checkbox('Daily Sales Report')).toBeChecked();
    // The note is on the row that was brought along, naming what needs it.
    const dsr = document.querySelector('[data-service="dsr-report"]')!;
    expect(dsr).toHaveTextContent('Needed with Load planner');
    expect(document.querySelector('[data-service="load-planner"]')).not.toHaveTextContent('Needed with');
    // …and it cannot be unticked while Load planner needs it.
    expect(checkbox('Daily Sales Report')).toBeDisabled();
    fireEvent.click(checkbox('Load planner'));
    expect(checkbox('Load planner')).not.toBeChecked();
    expect(checkbox('Daily Sales Report')).toBeChecked();
    expect(checkbox('Daily Sales Report')).toBeEnabled();
    expect(dsr).not.toHaveTextContent('Needed with');
    fireEvent.click(checkbox('Daily Sales Report'));
    expect(checkbox('Daily Sales Report')).not.toBeChecked();
  });

  it('says the same note in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /टैंकर मंगाने की योजना/ });
    fireEvent.click(screen.getByRole('checkbox', { name: /टैंकर मंगाने की योजना/ }));
    expect(document.querySelector('[data-service="dsr-report"]')).toHaveTextContent(
      'टैंकर मंगाने की योजना के साथ ज़रूरी',
    );
  });

  it('Save sends the ticks, then shows the chosen list with Change — and no second GET', async () => {
    const { queryClient } = card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /Load planner/ });
    fireEvent.click(checkbox('Load planner'));
    fireEvent.click(checkbox('TT Density'));
    h.put.mockResolvedValue(
      makeSetupView({
        stage: 'billing',
        strip: makeStrip(['done', 'current', 'todo', 'todo', 'todo']),
        services: {
          options: makeSetupView().services.options,
          chosen: ['dsr-report', 'tt-density', 'load-planner'],
          locked: false,
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save my services' }));

    await screen.findByText('Your services');
    expect(h.put).toHaveBeenCalledTimes(1);
    expect(h.put).toHaveBeenCalledWith('/v1/me/setup/services', {
      serviceIds: ['dsr-report', 'tt-density', 'load-planner'],
    });
    const list = within(box('services')).getAllByRole('listitem').map((li) => li.textContent);
    expect(list).toEqual(['Daily Sales Report', 'TT Density', 'Load planner']);
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    // The answer went straight into the cache.
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['outlet-setup', 'me'])).toMatchObject({ stage: 'billing' });
  });

  it('asks the server again when its answer is not the whole view', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /TT Density/ });
    fireEvent.click(checkbox('TT Density'));
    h.put.mockResolvedValue({ ok: true });
    h.get.mockResolvedValue(
      makeSetupView({
        services: { options: makeSetupView().services.options, chosen: ['tt-density'], locked: false },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save my services' }));
    await screen.findByText('Your services');
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(within(box('services')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'TT Density',
    ]);
  });

  describe('once chosen', () => {
    const chosen = makeSetupView({
      stage: 'billing',
      strip: makeStrip(['done', 'current', 'todo', 'todo', 'todo']),
      services: {
        options: makeSetupView().services.options,
        chosen: ['dsr-report', 'credit-dod-monitoring'],
        locked: false,
      },
    });

    it('Change reopens the ticks as they were saved, and Cancel goes back', async () => {
      card('services', chosen);
      await screen.findByText('Your services');
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      expect(checkbox('Daily Sales Report')).toBeChecked();
      expect(checkbox('Credit & DOD Monitoring')).toBeChecked();
      expect(checkbox('TT Density')).not.toBeChecked();
      fireEvent.click(checkbox('TT Density'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('checkbox')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      expect(checkbox('TT Density')).not.toBeChecked();
    });

    it('is locked after the bill is sent: the list, a note, and no Change', async () => {
      card(
        'services',
        makeSetupView({
          ...chosen,
          services: { ...chosen.services, locked: true },
          payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null },
        }),
      );
      await screen.findByText('Your services');
      expect(screen.getByText(/write to us in this chat/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });
  });

  it('a save refused because the bill was sent meanwhile says it is locked', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /TT Density/ });
    fireEvent.click(checkbox('TT Density'));
    h.put.mockRejectedValue(new ApiError(409, 'CONFLICT', 'locked'));
    fireEvent.click(screen.getByRole('button', { name: 'Save my services' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/write to us in this chat/);
  });

  it('any other failure says so and one tap tries again', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /TT Density/ });
    fireEvent.click(checkbox('TT Density'));
    h.put.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Save my services' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save — try again");
    h.put.mockResolvedValue(
      makeSetupView({
        services: { options: makeSetupView().services.options, chosen: ['tt-density'], locked: false },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save my services' }));
    await screen.findByText('Your services');
    expect(h.put).toHaveBeenCalledTimes(2);
  });

  it('does not send twice while a save is in flight', async () => {
    card('services', makeSetupView());
    await screen.findByRole('checkbox', { name: /TT Density/ });
    fireEvent.click(checkbox('TT Density'));
    let release!: (v: OutletSetupView) => void;
    h.put.mockReturnValue(new Promise<OutletSetupView>((res) => (release = res)));
    const save = screen.getByRole('button', { name: 'Save my services' });
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(save).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(save);
    expect(h.put).toHaveBeenCalledTimes(1);
    release(
      makeSetupView({
        services: { options: makeSetupView().services.options, chosen: ['tt-density'], locked: false },
      }),
    );
    await screen.findByText('Your services');
  });

  describe('a manager (cannot edit)', () => {
    it('is told the owner fills it, with nothing to tick', async () => {
      card('services', makeSetupView({ canEdit: false }));
      await screen.findByText('The owner fills this');
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('sees what the owner chose, without Change', async () => {
      card(
        'services',
        makeSetupView({
          canEdit: false,
          services: { options: makeSetupView().services.options, chosen: ['tt-density'], locked: false },
        }),
      );
      await screen.findByText('Your services');
      expect(screen.getByText('TT Density')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    });
  });
});

describe('the billing card', () => {
  const billingView = (over: Partial<OutletSetupView> = {}) =>
    makeSetupView({
      stage: 'billing',
      strip: makeStrip(['done', 'current', 'todo', 'todo', 'todo']),
      ...over,
    });
  const field = (label: string) => screen.getByLabelText(label);
  const SAVED: SetupBilling = {
    name: 'Sai Petroleums',
    address: 'NH-52, Deogarh',
    stateCode: '21',
    gstin: null,
  };

  async function open(view = billingView()) {
    card('billing', view);
    await screen.findByLabelText('Name on the bill');
  }
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  it('starts from the name MDG has, with the rest empty and the GST number optional', async () => {
    await open();
    expect(field('Name on the bill')).toHaveValue('Sai Petroleums');
    expect(field('Address (one line)')).toHaveValue('');
    expect(field('State')).toHaveValue('');
    expect(field('GST number (only if you have one)')).toHaveValue('');
    expect(screen.getByText(/Only if you want GST credit/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'No GST number' })).not.toBeChecked();
  });

  it('starts from the state and GST number the outlet already has', async () => {
    await open(
      billingView({
        billingPrefill: { name: 'Sai Petroleums', stateCode: '21', gstin: null },
      }),
    );
    expect(field('State')).toHaveValue('21');
  });

  it('lists the states in Hindi on the Hindi screen', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    card('billing', billingView());
    await screen.findByLabelText('बिल पर नाम');
    expect(screen.getByRole('option', { name: 'हरियाणा (Haryana)' })).toHaveValue('06');
    expect(screen.getByLabelText('GST नंबर (हो तो)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'GST नंबर नहीं देना' })).toBeInTheDocument();
  });

  it('will not save without a name, an address and a state, and says which', async () => {
    await open();
    fireEvent.change(field('Name on the bill'), { target: { value: ' ' } });
    save();
    expect(await screen.findByText('Enter the name for the bill')).toBeInTheDocument();
    expect(screen.getByText('Enter the address')).toBeInTheDocument();
    expect(screen.getAllByText('Choose your state').length).toBeGreaterThan(0);
    expect(h.put).not.toHaveBeenCalled();
  });

  it('saves without any GST number', async () => {
    await open();
    fireEvent.change(field('Address (one line)'), { target: { value: '  NH-52, Deogarh  ' } });
    fireEvent.change(field('State'), { target: { value: '21' } });
    h.put.mockResolvedValue(billingView({ billing: SAVED }));
    save();
    await screen.findByText('Bill details saved');
    expect(h.put).toHaveBeenCalledWith('/v1/me/setup/billing', {
      name: 'Sai Petroleums',
      address: 'NH-52, Deogarh',
      stateCode: '21',
      gstin: null,
    });
    expect(screen.getByText('Odisha')).toBeInTheDocument();
    expect(screen.getByText('No GST number given')).toBeInTheDocument();
  });

  describe('the GST number', () => {
    async function ready() {
      await open();
      fireEvent.change(field('Address (one line)'), { target: { value: 'NH-52, Deogarh' } });
      fireEvent.change(field('State'), { target: { value: '21' } });
    }
    const gst = () => field('GST number (only if you have one)');

    it('counts while it is typed, and does not block typing', async () => {
      await ready();
      fireEvent.change(gst(), { target: { value: '06abcde' } });
      expect(gst()).toHaveValue('06ABCDE');
      expect(screen.getByText('7 of 15')).toBeInTheDocument();
    });

    it('a half-typed one stops Save and says so', async () => {
      await ready();
      fireEvent.change(gst(), { target: { value: '06ABCDE' } });
      save();
      await waitFor(() => expect(h.put).not.toHaveBeenCalled());
      expect(screen.getByText('7 of 15')).toBeInTheDocument();
    });

    it('a right one reads the state from itself and locks the state box to it', async () => {
      await ready();
      fireEvent.change(gst(), { target: { value: GSTIN_MAHARASHTRA.toLowerCase() } });
      expect(screen.getByText('GST number looks right')).toBeInTheDocument();
      expect(field('State')).toHaveValue('27');
      expect(field('State')).toBeDisabled();
      expect(screen.getByText('State taken from the GST number')).toBeInTheDocument();
      // Take it away and the state box is the owner's again, as they had it.
      fireEvent.change(gst(), { target: { value: '' } });
      expect(field('State')).toBeEnabled();
      expect(field('State')).toHaveValue('21');
    });

    it('sends the cleaned number and the state it names, not the one picked', async () => {
      await ready();
      fireEvent.change(gst(), { target: { value: GSTIN_HARYANA } });
      h.put.mockResolvedValue(
        billingView({ billing: { ...SAVED, stateCode: '06', gstin: GSTIN_HARYANA } }),
      );
      save();
      await screen.findByText('Bill details saved');
      expect(h.put).toHaveBeenCalledWith('/v1/me/setup/billing', {
        name: 'Sai Petroleums',
        address: 'NH-52, Deogarh',
        stateCode: '06',
        gstin: GSTIN_HARYANA,
      });
      expect(screen.getByText(GSTIN_HARYANA)).toBeInTheDocument();
      expect(screen.getByText('Haryana')).toBeInTheDocument();
    });

    it('a wrong one (one character off) is flagged and blocks Save', async () => {
      await ready();
      const off = `${GSTIN_HARYANA.slice(0, 14)}${GSTIN_HARYANA[14] === '0' ? '1' : '0'}`;
      fireEvent.change(gst(), { target: { value: off } });
      expect(screen.getByText('This GST number does not look right. Please check it.')).toBeInTheDocument();
      expect(gst()).toHaveAttribute('aria-invalid', 'true');
      expect(field('State')).toBeEnabled();
      save();
      await waitFor(() => expect(h.put).not.toHaveBeenCalled());
    });

    it('"No GST number" clears it, locks the box, and sends none', async () => {
      await ready();
      fireEvent.change(gst(), { target: { value: GSTIN_HARYANA } });
      fireEvent.click(screen.getByRole('checkbox', { name: 'No GST number' }));
      expect(gst()).toHaveValue('');
      expect(gst()).toBeDisabled();
      expect(field('State')).toBeEnabled();
      h.put.mockResolvedValue(billingView({ billing: SAVED }));
      save();
      await screen.findByText('Bill details saved');
      expect(h.put).toHaveBeenCalledWith('/v1/me/setup/billing', expect.objectContaining({ gstin: null }));
    });

    it('a half-typed number does not stop "No GST number"', async () => {
      await ready();
      fireEvent.change(gst(), { target: { value: '06AB' } });
      fireEvent.click(screen.getByRole('checkbox', { name: 'No GST number' }));
      h.put.mockResolvedValue(billingView({ billing: SAVED }));
      save();
      await screen.findByText('Bill details saved');
    });
  });

  describe('once saved', () => {
    it('shows the details with Change, and Change reopens them as saved', async () => {
      card('billing', billingView({ billing: { ...SAVED, gstin: GSTIN_HARYANA, stateCode: '06' } }));
      await screen.findByText('Bill details saved');
      expect(screen.queryByLabelText('Name on the bill')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      expect(field('Name on the bill')).toHaveValue('Sai Petroleums');
      expect(field('Address (one line)')).toHaveValue('NH-52, Deogarh');
      expect(field('State')).toHaveValue('06');
      expect(field('GST number (only if you have one)')).toHaveValue(GSTIN_HARYANA);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByText('Bill details saved')).toBeInTheDocument();
    });

    it('a saved "no GST number" reopens with it ticked', async () => {
      card('billing', billingView({ billing: SAVED }));
      await screen.findByText('Bill details saved');
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      expect(screen.getByRole('checkbox', { name: 'No GST number' })).toBeChecked();
    });

    it('can still be changed after the bill is sent', async () => {
      card(
        'billing',
        billingView({
          stage: 'payment',
          billing: SAVED,
          payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null },
        }),
      );
      await screen.findByText('Bill details saved');
      expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    });

    it('is closed once the payment is in: no Change, and a note', async () => {
      card(
        'billing',
        billingView({
          stage: 'logins',
          billing: SAVED,
          payment: { state: 'paid', amountPaise: 354000, dueOn: '2026-11-02', paidOn: '2026-10-30' },
        }),
      );
      await screen.findByText('Bill details saved');
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
      expect(screen.getByText(/cannot be changed here any more/)).toBeInTheDocument();
    });

    it('a change refused because the payment came in meanwhile says it is closed', async () => {
      card('billing', billingView({ billing: SAVED }));
      await screen.findByText('Bill details saved');
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      h.put.mockRejectedValue(new ApiError(409, 'CONFLICT', 'paid'));
      save();
      expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be changed here any more/);
    });
  });

  it('a failed save says so and keeps what was typed', async () => {
    await open();
    fireEvent.change(field('Address (one line)'), { target: { value: 'NH-52, Deogarh' } });
    fireEvent.change(field('State'), { target: { value: '21' } });
    h.put.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save — try again");
    expect(field('Address (one line)')).toHaveValue('NH-52, Deogarh');
  });

  describe('a manager (cannot edit)', () => {
    it('is told the owner fills it', async () => {
      card('billing', billingView({ canEdit: false }));
      await screen.findByText('The owner fills this');
      expect(screen.queryByLabelText('Name on the bill')).toBeNull();
    });

    it('sees what the owner saved, without Change', async () => {
      card('billing', billingView({ canEdit: false, billing: SAVED }));
      await screen.findByText('Bill details saved');
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});

describe('the payment card', () => {
  const sent = makeSetupView({
    stage: 'payment',
    waitingOn: 'dealer',
    strip: makeStrip(['done', 'done', 'current', 'todo', 'todo']),
    payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null },
  });

  it('says what is due and by when, in English', async () => {
    card('payment', sent);
    await screen.findByText('Bill: ₹3,540 · due 2 November');
  });

  it('and in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    card('payment', sent);
    await screen.findByText('बिल: ₹3,540 · आख़िरी तारीख़ 2 नवंबर');
  });

  it('has NO button, no link and no word about how or where to pay', async () => {
    card('payment', sent, 'Your bill has been sent.');
    await screen.findByText('Bill: ₹3,540 · due 2 November');
    const el = box('payment');
    expect(within(el).queryByRole('button')).toBeNull();
    expect(within(el).queryByRole('link')).toBeNull();
    expect(el.querySelector('a, button, input, select, textarea, form')).toBeNull();
    // Nothing in the bubble either: the words MDG sent and the card's own.
    expect(document.body.textContent).not.toMatch(/\b(pay|upi|bank|account|ifsc|qr|razorpay|link)\b/i);
  });

  it('shows what was paid, and when', async () => {
    card(
      'payment',
      makeSetupView({
        stage: 'logins',
        payment: { state: 'paid', amountPaise: 354000, dueOn: '2026-11-02', paidOn: '2026-10-30' },
      }),
    );
    await screen.findByText('Payment received');
    expect(screen.getByText('Received on 30 October')).toBeInTheDocument();
    expect(box('payment').querySelector('a, button')).toBeNull();
  });

  it('an old bill card on a paid bill says paid, not what was true when it was posted', async () => {
    // The message was posted when the bill was sent; the view now says paid.
    card(
      'payment',
      makeSetupView({
        payment: { state: 'paid', amountPaise: 354000, dueOn: '2026-11-02', paidOn: '2026-11-01' },
      }),
      'Your bill has been sent.',
    );
    await screen.findByText('Payment received');
    expect(screen.queryByText(/due 2 November/)).toBeNull();
  });

  it('before the bill is sent, says MDG is getting it ready', async () => {
    card('payment', makeSetupView({ stage: 'payment', waitingOn: 'mdg' }));
    await screen.findByText("MDG's team is getting your bill ready.");
  });

  it('a manager sees the same, read-only', async () => {
    card('payment', { ...sent, canEdit: false });
    await screen.findByText('Bill: ₹3,540 · due 2 November');
    expect(screen.queryByText('The owner fills this')).toBeNull();
  });
});

describe('the started card', () => {
  it('is a small done note with nothing to press', async () => {
    card('started', makeSetupView({ stage: 'watch', waitingOn: 'nobody' }));
    await screen.findByText('Your services have started');
    expect(box('started').querySelector('a, button, input')).toBeNull();
  });
});
