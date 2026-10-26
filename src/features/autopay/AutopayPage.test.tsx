import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeAutopay, makeAutopayStatus } from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerAutopayStatus } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

const { AutopayPage } = await import('./AutopayPage');

const GET_PATH = '/v1/payments/me/autopay';
const STOP_PATH = '/v1/payments/me/autopay/stop';

/**
 * The server answers the status call with each of these in turn (the last one
 * repeats), and refuses any other address.
 */
function serve(...answers: Array<DealerAutopayStatus | Error>) {
  let i = 0;
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path !== GET_PATH) throw new Error(`unexpected GET ${path}`);
    const answer = answers[Math.min(i++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof api.get);
}

function renderPage(opts: { lang?: 'en' | 'hi'; role?: 'dealer-owner' | 'dealer-staff' } = {}) {
  signIn({ id: 'u1', role: opts.role ?? 'dealer-owner', dealerId: 'd1' });
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/settings/autopay" element={<AutopayPage />} />
      <Route path="/settings" element={<div>went:settings</div>} />
      <Route path="/chat" element={<div>went:chat</div>} />
      <Route path="/chat/:id" element={<div>went:thread</div>} />
    </Routes>,
    { route: '/settings/autopay' },
  );
}

/** What is on the screen to press, by name. */
const buttonNames = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);

const stoppedOff = (over = {}) =>
  makeAutopayStatus({
    state: 'off',
    nextDebitOn: null,
    stoppedAt: new Date().toISOString(),
    ...over,
  });

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => resetStores());

describe('AutopayPage — what it shows', () => {
  it('asks for this pump’s autopay, and shows a placeholder with "Loading…" while it comes', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => undefined));
    renderPage();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(GET_PATH));
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByText('Loading…')).toBeInTheDocument();
    // The bar is there even now, with a way back, and there is nothing to press yet.
    expect(screen.getByText('Autopay')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Back']);
  });

  it('on: the amount, the state, the pump, what it means — and one button, Stop autopay', async () => {
    serve(makeAutopayStatus());
    renderPage();

    expect(await screen.findByText('₹3,540')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('Pump 15E')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Taken from your UPI account every month. Next: 24 Nov. Your UPI app warns you a day before. You can also stop it in your UPI app.',
      ),
    ).toBeInTheDocument();
    // The Back arrow and the one button. Nothing turns it on, and nothing is a link.
    expect(buttonNames()).toEqual(['Back', 'Stop autopay']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('reads in Hindi', async () => {
    serve(makeAutopayStatus());
    renderPage({ lang: 'hi' });

    expect(await screen.findByText('₹3,540')).toBeInTheDocument();
    expect(screen.getByText('चालू')).toBeInTheDocument();
    expect(screen.getByText('पंप 15E')).toBeInTheDocument();
    expect(screen.getByText(/^हर महीने आपके UPI खाते से कटेंगे। अगली तारीख: 24 नव/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ऑटोपे बंद करें' })).toBeInTheDocument();
  });

  it('follows the amount the server sends', async () => {
    serve(makeAutopayStatus({ amountPaise: 118000 }));
    renderPage();
    expect(await screen.findByText('₹1,180')).toBeInTheDocument();
    expect(screen.queryByText('₹3,540')).not.toBeInTheDocument();
  });

  it('waiting: nothing has been taken, and the button is Cancel setup', async () => {
    serve(makeAutopayStatus({ state: 'setting_up', nextDebitOn: null }));
    renderPage();

    expect(await screen.findByText('Waiting for your approval. Nothing has been taken.')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Back', 'Cancel setup']);
    // Vague on purpose: no word on where the approval is.
    expect(document.body.textContent ?? '').not.toMatch(/message|link|sent/i);
  });

  it('failing: says the debit did not go through, keeps Stop, and adds Ask in chat', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus({ state: 'failing' }));
    renderPage();

    expect(
      await screen.findByText(
        'The last ₹3,540 debit did not go through. Check the balance in your UPI account.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(buttonNames()).toEqual([
      'Back',
      'Stop autopay',
      'Ask in chatNot here? Write to the MDG team.',
    ]);

    await user.click(screen.getByRole('button', { name: /Ask in chat/ }));
    expect(await screen.findByText('went:chat')).toBeInTheDocument();
  });

  it('on has no Ask in chat row on the screen', async () => {
    serve(makeAutopayStatus());
    renderPage();
    await screen.findByText('₹3,540');
    expect(screen.queryByText('Ask in chat')).not.toBeInTheDocument();
  });

  it('off: says so, says the service works till the paid day, and has no Stop', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus({ state: 'off', nextDebitOn: null }));
    renderPage();

    expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
    expect(
      screen.getByText('Dealer Kavach works till 24 Nov. Nothing will be taken automatically.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Stop autopay')).not.toBeInTheDocument();
    expect(screen.queryByText('₹3,540')).not.toBeInTheDocument();
    // One line with the chat, for stopping Dealer Kavach itself.
    await user.click(screen.getByRole('button', { name: 'Want to stop Dealer Kavach itself? Tell us in chat.' }));
    expect(await screen.findByText('went:chat')).toBeInTheDocument();
  });

  it('off, in Hindi', async () => {
    serve(makeAutopayStatus({ state: 'off', nextDebitOn: null }));
    renderPage({ lang: 'hi' });
    expect(await screen.findByText('ऑटोपे बंद है')).toBeInTheDocument();
    expect(screen.getByText(/^डीलर कवच 24 नव.* तक चलेगा। पैसे अपने-आप नहीं कटेंगे।$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'डीलर कवच ही बंद करना है? चैट में बताइए।' })).toBeInTheDocument();
  });

  it('none: says autopay is not on for this pump, with no button and no way to start one', async () => {
    serve(makeAutopayStatus(null));
    renderPage();

    expect(await screen.findByText('Autopay is not on for this pump')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Back']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('says it could not load, rather than "not on", and offers to try again', async () => {
    const user = userEvent.setup();
    serve(new ApiError(500, 'INTERNAL', 'boom'));
    renderPage();

    expect(await screen.findByText("We couldn't load your autopay")).toBeInTheDocument();
    expect(screen.queryByText('Autopay is not on for this pump')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    serve(makeAutopayStatus());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('₹3,540')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your autopay")).not.toBeInTheDocument();
  });

  it('says it could not load in Hindi', async () => {
    serve(new ApiError(500, 'INTERNAL', 'boom'));
    renderPage({ lang: 'hi' });
    expect(await screen.findByText('आपका ऑटोपे लोड नहीं हुआ')).toBeInTheDocument();
  });

  it('goes back to Settings when the screen was opened cold', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus());
    renderPage();
    await screen.findByText('₹3,540');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('went:settings')).toBeInTheDocument();
  });
});

describe('AutopayPage — a manager', () => {
  it('sees only that the owner changes it: no request, no amount, no button', async () => {
    serve(makeAutopayStatus());
    renderPage({ role: 'dealer-staff' });

    expect(await screen.findByText('Only the owner can change autopay')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByText('₹3,540')).not.toBeInTheDocument();
    expect(buttonNames()).toEqual(['Back']);
  });

  it('says it in Hindi', async () => {
    renderPage({ role: 'dealer-staff', lang: 'hi' });
    expect(await screen.findByText('ऑटोपे सिर्फ़ मालिक बदल सकते हैं')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('AutopayPage — the stop dialog', () => {
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Stop autopay' }));
    return screen.findByRole('alertdialog', { name: 'Stop autopay?' });
  }

  it('opens an alert dialog with what stopping does, five unpicked reasons and two stacked buttons', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus());
    renderPage();

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText(
        'No money will be taken automatically after this. Dealer Kavach keeps working till 24 Nov. After that you get a bill each month.',
      ),
    ).toBeInTheDocument();
    // Nothing is said about being taken right now when no debit is in flight.
    expect(within(dialog).queryByText(/is being taken right now/)).not.toBeInTheDocument();

    expect(within(dialog).getByText('Why? (optional)')).toBeInTheDocument();
    const chips = within(dialog).getAllByRole('button', { pressed: false });
    expect(chips.map((c) => c.textContent)).toEqual([
      "I'll pay myself each month",
      'Price is too much',
      'Not useful / something is wrong',
      'Closing or selling the pump',
      'Something else',
    ]);
    expect(within(dialog).queryByRole('button', { pressed: true })).not.toBeInTheDocument();

    // The danger button on top, the way out under it, and no bare Cancel.
    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent);
    expect(buttons.slice(-2)).toEqual(['Stop autopay', 'Keep autopay']);
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('is in Hindi', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus());
    renderPage({ lang: 'hi' });

    await user.click(await screen.findByRole('button', { name: 'ऑटोपे बंद करें' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'ऑटोपे बंद करें?' });
    expect(within(dialog).getByText('क्यों? (ज़रूरी नहीं)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'हर महीने खुद भरूँगा' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'ऑटोपे चालू रखें' })).toBeInTheDocument();
  });

  it('warns first when a debit is being taken right now', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus({ debitInProgress: true }));
    renderPage();

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText('₹3,540 is being taken right now. Stopping will not undo it.'),
    ).toBeInTheDocument();
  });

  it('offers the first-month refund in the help line only inside the first month', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus({ firstMonthRefundable: true }));
    renderPage();

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByRole('button', {
        name: 'Not happy with the first month? We refund it in full. Ask in chat.',
      }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Something not right? Ask in chat.')).not.toBeInTheDocument();
  });

  it('has the plain help line otherwise, and it opens the chat', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus());
    renderPage();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Something not right? Ask in chat.' }));
    expect(await screen.findByText('went:chat')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('is Cancel autopay setup? while waiting, with Cancel setup and Keep setup', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus({ state: 'setting_up', nextDebitOn: null }));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel setup' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel autopay setup?' });
    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent);
    expect(buttons.slice(-2)).toEqual(['Cancel setup', 'Keep setup']);
  });

  describe('keeps it', () => {
    it.each([
      ['the Keep button', async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Keep autopay' }))],
      ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
      ['the backdrop', async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(document.querySelector('button[aria-hidden="true"]') as HTMLElement)],
      ['the phone’s Back button', async () => {
        act(() => window.history.back());
      }],
    ])('with %s: the dialog closes, nothing is sent, and it is still on', async (_name, leave) => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      renderPage();

      await openDialog(user);
      await leave(user);

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(api.post).not.toHaveBeenCalled();
      expect(screen.getByText('On')).toBeInTheDocument();
      // It did not leave the screen either.
      expect(screen.getByRole('button', { name: 'Stop autopay' })).toBeInTheDocument();
    });
  });

  describe('stopping it', () => {
    it('sends no reason when none was picked, and flips the screen to Off with a toast', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith(STOP_PATH, {});
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('Autopay stopped. No more money will be taken.')).toBeInTheDocument();
      expect(
        screen.getByText('Dealer Kavach works till 24 Nov. Nothing will be taken automatically.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Stop autopay' })).not.toBeInTheDocument();
      // Settled by the answer itself, not by asking again.
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('sends the reason that was picked', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Closing or selling the pump' }));
      expect(within(dialog).getByRole('button', { name: 'Closing or selling the pump', pressed: true })).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      await screen.findByText('Autopay is off');
      expect(api.post).toHaveBeenCalledWith(STOP_PATH, { reason: 'closing' });
    });

    it('lets a pick be changed, and cleared by a second tap, before the stop', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      renderPage();

      const dialog = await openDialog(user);
      const pay = within(dialog).getByRole('button', { name: "I'll pay myself each month" });
      const price = within(dialog).getByRole('button', { name: 'Price is too much' });
      await user.click(pay);
      await user.click(price);
      // One at a time: the first was let go.
      expect(pay).toHaveAttribute('aria-pressed', 'false');
      expect(price).toHaveAttribute('aria-pressed', 'true');
      await user.click(price);
      expect(price).toHaveAttribute('aria-pressed', 'false');
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      await screen.findByText('Autopay is off');
      expect(api.post).toHaveBeenCalledWith(STOP_PATH, {});
    });

    it('shows nothing as done until the server answers, and cannot be left or pressed twice meanwhile', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      let answer: (s: DealerAutopayStatus) => void = () => undefined;
      vi.mocked(api.post).mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      // Saving: the words change, both buttons are off, the reasons are off.
      const saving = await within(dialog).findByRole('button', { name: 'Stopping…' });
      expect(saving).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Keep autopay' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Price is too much' })).toBeDisabled();
      // Nothing says it worked, and the screen behind still says On.
      expect(screen.queryByText('Autopay stopped. No more money will be taken.')).not.toBeInTheDocument();
      expect(screen.queryByText('Autopay is off')).not.toBeInTheDocument();
      expect(screen.getByText('On')).toBeInTheDocument();
      // Escape and the backdrop do not hide an answer that is still coming.
      await user.keyboard('{Escape}');
      await user.click(document.querySelector('button[aria-hidden="true"]') as HTMLElement);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledTimes(1);

      await act(async () => answer(stoppedOff()));
      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
      expect(screen.getByText('Autopay stopped. No more money will be taken.')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('says "Stopping…" in Hindi while it waits', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockReturnValue(new Promise(() => undefined));
      renderPage({ lang: 'hi' });

      await user.click(await screen.findByRole('button', { name: 'ऑटोपे बंद करें' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'ऑटोपे बंद करें' }));
      expect(await within(dialog).findByRole('button', { name: 'बंद हो रहा है…' })).toBeDisabled();
    });

    // The server itself said Razorpay did not answer and nothing was touched.
    it.each([
      ['RAZORPAY_UNREACHABLE', new ApiError(503, 'RAZORPAY_UNREACHABLE', 'down')],
      ['AUTOPAY_NOT_STOPPED', new ApiError(503, 'AUTOPAY_NOT_STOPPED', 'down')],
    ])('when the server says %s: the dialog stays open and says nothing has changed', async (_name, err) => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockRejectedValue(err);
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      const line = await within(dialog).findByRole('alert');
      expect(line).toHaveTextContent(
        'Not stopped. The payment service did not answer. Nothing has changed. Please try again in a minute.',
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.queryByText('Autopay stopped. No more money will be taken.')).not.toBeInTheDocument();
      expect(screen.queryByText('Autopay is off')).not.toBeInTheDocument();
      expect(screen.getByText('On')).toBeInTheDocument();
      // Free to try again, or to keep it.
      expect(within(dialog).getByRole('button', { name: 'Stop autopay' })).toBeEnabled();
      expect(within(dialog).getByRole('button', { name: 'Keep autopay' })).toBeEnabled();
    });

    // The server answered with a refusal of its own: it touched nothing, and says why.
    it.each([
      [
        'payments are switched off',
        new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'off'),
        'Not stopped. Online payment is switched off right now. Nothing has changed. Please try again later.',
      ],
      [
        'the payment service refused',
        new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'BAD_REQUEST_ERROR: x'),
        'Not stopped. The payment service refused it. Nothing has changed. Please try again in a minute.',
      ],
      [
        'too many tries',
        new ApiError(429, 'RATE_LIMITED', 'slow down'),
        'Not stopped. Nothing has changed. Please try again in a minute.',
      ],
    ])('when %s: it says not stopped and nothing has changed', async (_name, err, words) => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockRejectedValue(err);
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      const line = await within(dialog).findByRole('alert');
      expect(line).toHaveTextContent(words);
      expect(line).not.toHaveTextContent('could not confirm');
      expect(within(dialog).getByRole('button', { name: 'Stop autopay' })).toBeEnabled();
    });

    // The reply never came, or was not understood: the stop may have landed. The
    // dialog must not promise "nothing has changed", and the page must look again.
    it.each([
      ['the phone has no network', new ApiError(0, 'NETWORK_ERROR', 'Failed to fetch')],
      ['the request timed out', new ApiError(0, 'TIMEOUT', 'Request timed out')],
      ['the server errors', new ApiError(500, 'INTERNAL', 'boom')],
    ])('when %s: it says it could not confirm, never "nothing has changed"', async (_name, err) => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockRejectedValue(err);
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      const line = await within(dialog).findByRole('alert');
      expect(line).toHaveTextContent('We could not confirm. Autopay may already be stopped.');
      expect(line).not.toHaveTextContent('Nothing has changed');
      expect(within(dialog).getByRole('button', { name: 'Stop autopay' })).toBeEnabled();
      expect(within(dialog).getByRole('button', { name: 'Keep autopay' })).toBeEnabled();
    });

    it('reads the status again after a lost reply, and shows Off when the stop had landed', async () => {
      const user = userEvent.setup();
      // On the first read, off on the second: the stop went through, its reply did not.
      serve(makeAutopayStatus(), stoppedOff());
      vi.mocked(api.post).mockRejectedValue(new ApiError(0, 'TIMEOUT', 'Request timed out'));
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('says the failure in Hindi', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockRejectedValue(new ApiError(503, 'RAZORPAY_UNREACHABLE', 'down'));
      renderPage({ lang: 'hi' });

      await user.click(await screen.findByRole('button', { name: 'ऑटोपे बंद करें' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'ऑटोपे बंद करें' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'बंद नहीं हुआ। पेमेंट सर्विस से जवाब नहीं आया। कुछ नहीं बदला। कृपया एक मिनट बाद फिर कोशिश करें।',
      );
    });

    it('says it could not confirm, in Hindi, after a timeout', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockRejectedValue(new ApiError(0, 'TIMEOUT', 'Request timed out'));
      renderPage({ lang: 'hi' });

      await user.click(await screen.findByRole('button', { name: 'ऑटोपे बंद करें' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'ऑटोपे बंद करें' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'जवाब नहीं मिल पाया। हो सकता है ऑटोपे बंद हो गया हो।',
      );
    });

    it('works on a second try after a failure, keeping the reason that was picked', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post)
        .mockRejectedValueOnce(new ApiError(503, 'RAZORPAY_UNREACHABLE', 'down'))
        .mockResolvedValueOnce(stoppedOff());
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Price is too much' }));
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));
      await within(dialog).findByRole('alert');

      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));
      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.post).mock.calls[1]).toEqual([STOP_PATH, { reason: 'too_expensive' }]);
      // The red line went with the dialog.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says "already off" when the server found it stopped before this tap (the UPI app)', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(
        stoppedOff({ stoppedAt: '2026-10-24T08:30:00.000Z' }),
      );
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
      expect(screen.getByText('Autopay is already off.')).toBeInTheDocument();
      expect(screen.queryByText('Autopay stopped. No more money will be taken.')).not.toBeInTheDocument();
    });

    it('says "already off" in Hindi', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(
        stoppedOff({ stoppedAt: '2026-10-24T08:30:00.000Z' }),
      );
      renderPage({ lang: 'hi' });

      await user.click(await screen.findByRole('button', { name: 'ऑटोपे बंद करें' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'ऑटोपे बंद करें' }));
      expect(await screen.findByText('ऑटोपे पहले से बंद है।')).toBeInTheDocument();
    });

    it('says the stop in Hindi', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      renderPage({ lang: 'hi' });

      await user.click(await screen.findByRole('button', { name: 'ऑटोपे बंद करें' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'ऑटोपे बंद करें' }));
      expect(await screen.findByText('ऑटोपे बंद हो गया। अब पैसे नहीं कटेंगे।')).toBeInTheDocument();
      expect(screen.getByText('ऑटोपे बंद है')).toBeInTheDocument();
    });

    it('when there is nothing left to stop (404), closes, says it is already off, and reads the screen again', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus(), makeAutopayStatus(null));
      vi.mocked(api.post).mockRejectedValue(new ApiError(404, 'NO_AUTOPAY', 'none'));
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));

      expect(await screen.findByText('Autopay is already off.')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await screen.findByText('Autopay is not on for this pump')).toBeInTheDocument();
    });

    it('cancels a setup that was never approved, the same way', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus({ state: 'setting_up', nextDebitOn: null }));
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Cancel setup' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Cancel autopay setup?' });
      await user.click(within(dialog).getByRole('button', { name: 'Cancel setup' }));

      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith(STOP_PATH, {});
    });

    it('stops a failing autopay too', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus({ state: 'failing' }));
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      renderPage();

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));
      expect(await screen.findByText('Autopay is off')).toBeInTheDocument();
    });

    it('reads the bills again, so a due bill stops saying autopay will take it', async () => {
      const user = userEvent.setup();
      serve(makeAutopayStatus());
      vi.mocked(api.post).mockResolvedValue(stoppedOff());
      const view = renderPage();
      const invalidate = vi.spyOn(view.queryClient, 'invalidateQueries');

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));
      await screen.findByText('Autopay is off');

      const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey);
      expect(keys).toContainEqual(['payments']);
    });
  });

  it('shows "Off" with the paid day even when the answer to the stop has no next debit', async () => {
    const user = userEvent.setup();
    serve(makeAutopayStatus({ paidThrough: '2026-12-02' }));
    vi.mocked(api.post).mockResolvedValue(
      makeAutopayStatus({ ...makeAutopay(), state: 'off', nextDebitOn: null, paidThrough: '2026-12-02', stoppedAt: new Date().toISOString() }),
    );
    renderPage();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Stop autopay' }));
    expect(
      await screen.findByText('Dealer Kavach works till 2 Dec. Nothing will be taken automatically.'),
    ).toBeInTheDocument();
  });
});
