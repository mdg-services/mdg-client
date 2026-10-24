import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from '@/features/chat/MessageBubble';
import { MessageList } from '@/features/chat/MessageList';
import { ApiError } from '@/lib/api';
import { LONG_PRESS_MS } from '@/lib/useLongPress';
import { useLangStore } from '@/store/lang';
import { GSTIN_HARYANA, GSTIN_MAHARASHTRA, makeSetupView, makeStrip } from '@/test/setupFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import { SETUP_CARDS, type OutletSetupView, type SetupBilling, type SetupCardKind } from '@dk/shared/types';

import { isRetiredSetupCard, setupCardHasBody } from './SetupCard';
import { SetupCardView } from './SetupCardView';

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
  // The video player locks the page behind it and puts the scroll back on closing.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

    card('billing', makeSetupView());
    await screen.findByLabelText('Name on the bill');
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
    card('billing', makeSetupView({ active: false }));
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(document.querySelector('[data-setup-card]')).toBeNull();
    expect(screen.queryByLabelText('Name on the bill')).toBeNull();
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
          body: 'Fill in your bill details.',
          setupCard: { card: 'billing' },
        })}
        mine={false}
        onLongPress={onLongPress}
      />,
    );
    await screen.findByLabelText('Name on the bill');
    expect(box('billing')).toHaveAttribute('data-no-swipe');

    const hold = async (el: Element) => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5 });
      await act(async () => {
        await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60));
      });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
    };
    await hold(screen.getByLabelText('Name on the bill'));
    expect(onLongPress).not.toHaveBeenCalled();
    // The same hold on the words does select it: the card is what is different.
    await hold(screen.getByText('Fill in your bill details.'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe('the retired services card', () => {
  const retired = () =>
    makeMessage({
      id: 'services-msg',
      senderId: 'system-user',
      senderRole: 'admin',
      senderName: 'MDG',
      system: true,
      body: 'Which services would you like?',
      setupCard: { card: 'services' },
    });

  it('draws nothing: a message from before the step went has no question left to answer', async () => {
    h.get.mockResolvedValue(makeSetupView());
    const { container } = renderWithProviders(<MessageBubble message={retired()} mine={false} />);
    await Promise.resolve();
    // Not even an empty bubble: the toast layer is all the provider leaves in the DOM.
    expect(container.textContent).toBe('');
    expect(container.querySelector('.rounded-md')).toBeNull();
    expect(screen.queryByText('Which services would you like?')).toBeNull();
    expect(document.querySelector('[data-setup-card]')).toBeNull();
    // …and it never asks the server for the outlet on its account.
    expect(h.get).not.toHaveBeenCalled();
  });

  it('is not a row in the thread either, and the messages around it are untouched', async () => {
    const welcome = makeMessage({
      id: 'welcome',
      senderId: 'system-user',
      senderRole: 'admin',
      system: true,
      body: 'Welcome to Dealer Kavach!',
    });
    const after = makeMessage({
      id: 'after',
      senderId: 'system-user',
      senderRole: 'admin',
      system: true,
      body: 'Thanks, we have it.',
    });
    renderWithProviders(
      <MessageList messages={[welcome, retired(), after]} currentUserId="u1" conversationId="c1" />,
    );
    expect(screen.getByText('Welcome to Dealer Kavach!')).toBeInTheDocument();
    expect(screen.getByText('Thanks, we have it.')).toBeInTheDocument();
    expect(screen.queryByText('Which services would you like?')).toBeNull();
  });

  it('is a card kind that still parses, and has no body to draw', () => {
    expect(SETUP_CARDS).toContain('services');
    expect(setupCardHasBody('services')).toBe(false);
    expect(isRetiredSetupCard(retired())).toBe(true);
    expect(isRetiredSetupCard(makeMessage({ setupCard: { card: 'billing' } }))).toBe(false);
    expect(isRetiredSetupCard(makeMessage())).toBe(false);
  });

  it('draws nothing when the strip sheet or a view is asked for it', () => {
    const { container } = renderWithProviders(
      <SetupCardView card="services" view={makeSetupView()} />,
    );
    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-setup-card]')).toBeNull();
  });
});

describe('the billing card', () => {
  const billingView = (over: Partial<OutletSetupView> = {}) =>
    makeSetupView({
      stage: 'billing',
      strip: makeStrip(['current', 'todo', 'todo', 'todo']),
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

    it("says MDG's team filled it in, in a small line, only when the view says so", async () => {
      card('billing', billingView({ billing: SAVED, billingSavedBy: 'mdg' }));
      await screen.findByText('Bill details saved');
      expect(screen.getByText("Filled in by MDG's team")).toBeInTheDocument();
      // It is a note, not a button: nothing new to press, and the owner can still change them.
      expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    });

    it('says it in Hindi', async () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      card('billing', billingView({ billing: SAVED, billingSavedBy: 'mdg' }));
      expect(await screen.findByText('MDG की टीम ने भरा')).toBeInTheDocument();
    });

    it('says nothing of the sort for details the dealer saved, or a view from before the field', async () => {
      const older = { ...billingView({ billing: SAVED }) } as Partial<OutletSetupView>;
      delete older.billingSavedBy;
      for (const view of [
        billingView({ billing: SAVED, billingSavedBy: 'dealer' }),
        billingView({ billing: SAVED, billingSavedBy: null }),
        older as OutletSetupView,
      ]) {
        card('billing', view);
        await screen.findByText('Bill details saved');
        expect(screen.queryByText(/Filled in by/)).toBeNull();
        cleanup();
      }
    });

    it("the line goes once the owner opens the details to change them", async () => {
      card('billing', billingView({ billing: SAVED, billingSavedBy: 'mdg' }));
      await screen.findByText("Filled in by MDG's team");
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      expect(screen.queryByText("Filled in by MDG's team")).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByText("Filled in by MDG's team")).toBeInTheDocument();
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
          payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null, paymentId: null },
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
          payment: { state: 'paid', amountPaise: 354000, dueOn: '2026-11-02', paidOn: '2026-10-30', paymentId: null },
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
    strip: makeStrip(['done', 'current', 'todo', 'todo']),
    payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null, paymentId: null },
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
        payment: {
          state: 'paid',
          amountPaise: 354000,
          dueOn: '2026-11-02',
          paidOn: '2026-10-30',
          paymentId: null,
        },
      }),
    );
    await screen.findByText('Payment received');
    expect(screen.getByText('Received on 30 October')).toBeInTheDocument();
    // a bill that is paid but has no payment to open has nothing to press
    expect(box('payment').querySelector('a, button')).toBeNull();
  });

  it('once paid, links to the receipt and to nothing else: never a button, never a way to pay', async () => {
    card(
      'payment',
      makeSetupView({
        stage: 'logins',
        payment: {
          state: 'paid',
          amountPaise: 354000,
          dueOn: '2026-11-02',
          paidOn: '2026-10-30',
          paymentId: 'p-123',
        },
      }),
    );
    await screen.findByText('Payment received');
    const link = within(box('payment')).getByRole('link', { name: 'View receipt' });
    expect(link).toHaveAttribute('href', '/payments/p-123');
    expect(box('payment').querySelectorAll('a')).toHaveLength(1);
    expect(box('payment').querySelector('button, input, form')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b(pay|upi|bank|account|ifsc|qr|razorpay)\b/i);
  });

  it('says the receipt link in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    card(
      'payment',
      makeSetupView({
        payment: {
          state: 'paid',
          amountPaise: 354000,
          dueOn: '2026-11-02',
          paidOn: '2026-10-30',
          paymentId: 'p-123',
        },
      }),
    );
    expect(await screen.findByRole('link', { name: 'रसीद देखें' })).toHaveAttribute('href', '/payments/p-123');
  });

  it('says the due date has passed when it has, as a fact, with nothing to press', async () => {
    card(
      'payment',
      makeSetupView({
        stage: 'payment',
        payment: { state: 'sent', amountPaise: 354000, dueOn: '2020-01-01', paidOn: null, paymentId: 'p-123' },
      }),
    );
    await screen.findByText('The due date has passed');
    expect(box('payment').querySelector('a, button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b(pay|upi|bank|account|ifsc|qr|razorpay|link)\b/i);
  });

  it('and says nothing of the sort before the day, on the day, or in Hindi when it has', async () => {
    card(
      'payment',
      makeSetupView({
        stage: 'payment',
        payment: { state: 'sent', amountPaise: 354000, dueOn: '2099-01-01', paidOn: null, paymentId: 'p-123' },
      }),
    );
    await screen.findByText(/Bill: ₹3,540/);
    expect(screen.queryByText('The due date has passed')).toBeNull();
    cleanup();
    useLangStore.setState({ lang: 'hi', explicit: false });
    card(
      'payment',
      makeSetupView({
        stage: 'payment',
        payment: { state: 'sent', amountPaise: 354000, dueOn: '2020-01-01', paidOn: null, paymentId: 'p-123' },
      }),
    );
    await screen.findByText('आख़िरी तारीख़ निकल चुकी है');
  });

  it('an old bill card on a paid bill says paid, not what was true when it was posted', async () => {
    // The message was posted when the bill was sent; the view now says paid.
    card(
      'payment',
      makeSetupView({
        payment: {
          state: 'paid',
          amountPaise: 354000,
          dueOn: '2026-11-02',
          paidOn: '2026-11-01',
          paymentId: null,
        },
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
