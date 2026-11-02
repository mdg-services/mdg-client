import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wemmisLoginKey } from '@/hooks/api/useWemmisLogin';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';
import type { DealerWemmisLoginView, WemmisResetView } from '@dk/shared/types';

import { WemmisLoginBox } from './WemmisLoginBox';

// The hooks are doubles: these tests are about what the box draws and sends in
// each state. How the hooks talk to the server (paths, polling) has its own test.
const h = vi.hoisted(() => ({
  login: {
    data: undefined as DealerWemmisLoginView | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  reset: {
    data: undefined as WemmisResetView | undefined,
    error: null as unknown,
    isError: false,
    refetch: vi.fn(),
  },
  resetCalls: vi.fn(),
  save: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
  start: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
  answer: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
}));
vi.mock('@/hooks/api/useWemmisLogin', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useWemmisLogin: () => h.login,
  useWemmisReset: (id: string | null, seed?: WemmisResetView | null) => {
    h.resetCalls(id, seed);
    return h.reset;
  },
  useSaveWemmisLogin: () => h.save,
  useStartWemmisReset: () => h.start,
  useAnswerWemmisReset: () => h.answer,
}));

const USER = 'test-user-01';
const SECRET = 'Pa55word!x';
const MOBILE = '9876543210';

function login(over: Partial<DealerWemmisLoginView> = {}): DealerWemmisLoginView {
  return { status: 'missing', username: null, canEdit: true, reset: null, ...over };
}
function reset(over: Partial<WemmisResetView> = {}): WemmisResetView {
  return {
    id: 'r1',
    state: 'otp_sent',
    mobileMasked: 'XXXXXX1234',
    expiresAt: new Date(Date.now() + 112_000).toISOString(),
    usernames: [],
    captchaImageUrl: null,
    message: null,
    ...over,
  };
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.login.data = login();
  h.login.isPending = false;
  h.login.isError = false;
  h.login.refetch.mockReset();
  h.reset.data = undefined;
  h.reset.error = null;
  h.reset.isError = false;
  h.reset.refetch.mockReset();
  h.resetCalls.mockReset();
  for (const m of [h.save, h.start, h.answer]) {
    m.mutateAsync.mockReset();
    m.mutateAsync.mockResolvedValue(undefined);
    m.reset.mockReset();
    m.isPending = false;
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const box = () => renderWithProviders(<WemmisLoginBox />);

/** The four OTP boxes, in order. */
const otpBoxes = () => screen.getAllByLabelText(/^OTP digit \d of 4$/) as HTMLInputElement[];

function typeOtp(digits: string) {
  const boxes = otpBoxes();
  [...digits].forEach((d, i) => fireEvent.change(boxes[i]!, { target: { value: d } }));
}

/** Owner opens "Forgot password?", types the mobile, taps Send OTP, and the server says `state`. */
async function startReset(state: WemmisResetView) {
  h.start.mutateAsync.mockResolvedValue(login({ reset: state }));
  h.reset.data = state;
  box();
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
  fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
  await waitFor(() => expect(h.resetCalls).toHaveBeenCalledWith(state.id, null));
}

describe('WemmisLoginBox — the login', () => {
  it('names itself and says why, in one line', () => {
    box();
    expect(screen.getByText('eMaaptaul login')).toBeInTheDocument();
    expect(
      screen.getByText('To download your calibration certificate and fee receipt'),
    ).toBeInTheDocument();
  });

  it('speaks Hindi when the app is in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    box();
    expect(screen.getByText('eMaaptaul लॉगिन')).toBeInTheDocument();
    expect(screen.getByText('पासवर्ड भूल गए?')).toBeInTheDocument();
    expect(screen.getByText('बाकी')).toBeInTheDocument();
  });

  it('shows only a spinner while the first answer is on its way', () => {
    h.login.data = undefined;
    h.login.isPending = true;
    const { container } = box();
    expect(container.querySelector('[data-wemmis-login]')).toHaveAttribute(
      'data-status',
      'loading',
    );
    expect(screen.queryByLabelText('User ID')).toBeNull();
  });

  it('says so and offers Try again when where it stands could not be fetched', () => {
    h.login.data = undefined;
    h.login.isError = true;
    box();
    expect(screen.getByText("Couldn't check this just now")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.login.refetch).toHaveBeenCalledTimes(1);
  });

  describe('missing', () => {
    it('shows a grey "Needed" chip, both fields, a 44px black Save and "Forgot password?"', () => {
      box();
      expect(screen.getByText('Needed')).toBeInTheDocument();

      const user = screen.getByLabelText('User ID');
      expect(user).toHaveAttribute('autocomplete', 'off');
      expect(user).toHaveAttribute('autocapitalize', 'none');
      expect(user).toHaveAttribute('spellcheck', 'false');
      expect(user.className).toContain('h-11');

      const pass = screen.getByLabelText('Password');
      expect(pass).toHaveAttribute('type', 'password');
      expect(pass).toHaveAttribute('autocomplete', 'new-password');

      const save = screen.getByRole('button', { name: 'Save' });
      expect(save.className).toContain('h-11');
      expect(save.className).toContain('w-full');
      expect(save.className).toContain('bg-wa-accent');
      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
      expect(screen.getByText('Kept safe — never shown in the chat')).toBeInTheDocument();
    });

    it('keeps Save off until both fields have something', () => {
      box();
      const save = screen.getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: USER } });
      expect(save).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
      expect(save).toBeEnabled();
    });

    it('the eye shows and hides the password, and says which it will do', () => {
      box();
      const pass = screen.getByLabelText('Password');
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(pass).toHaveAttribute('type', 'text');
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(pass).toHaveAttribute('type', 'password');
    });

    it('saves the trimmed user ID and the password as typed, and empties the password after', async () => {
      box();
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: `  ${USER} ` } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(h.save.mutateAsync).toHaveBeenCalledTimes(1));
      expect(h.save.mutateAsync).toHaveBeenCalledWith({ username: USER, password: SECRET });
      await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''));
      expect(screen.getByLabelText('User ID')).toHaveValue('');
      // The mutation's own copy of what was typed is dropped too.
      expect(h.save.reset).toHaveBeenCalled();
    });

    it('is told "this is the password that stopped working" on a 409, and the field is emptied', async () => {
      h.save.mutateAsync.mockRejectedValue(
        new ApiError(409, 'WEMMIS_LOGIN_SAME_AS_REFUSED', 'internal detail'),
      );
      box();
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: USER } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText('This is the password that stopped working. Enter the new one.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toHaveValue('');
      expect(screen.getByLabelText('User ID')).toHaveValue(USER);
    });

    it('says "try again in a little while" on a 429, never the server\'s own words', async () => {
      h.save.mutateAsync.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'internal detail'));
      box();
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: USER } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Try again in a little while')).toBeInTheDocument();
      expect(screen.queryByText(/internal detail/)).toBeNull();
      // Kept, so the retry is one tap.
      expect(screen.getByLabelText('Password')).toHaveValue(SECRET);
    });

    it('says "couldn\'t save" for anything else', async () => {
      h.save.mutateAsync.mockRejectedValue(new ApiError(500, 'BOOM', 'internal detail'));
      box();
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: USER } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText("Couldn't save — try again")).toBeInTheDocument();
    });
  });

  describe('refused', () => {
    it('says the site did not accept the saved password, and asks again', () => {
      h.login.data = login({ status: 'refused', username: USER });
      box();
      expect(screen.getByText('Old password not working')).toBeInTheDocument();
      expect(
        screen.getByText(
          'The site did not accept the saved password. Enter it again, or reset it.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('User ID')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    });
  });

  describe('saved', () => {
    beforeEach(() => {
      h.login.data = login({ status: 'saved', username: USER });
    });

    it('says "Saved ✓" and the user ID, with Change — and no form', () => {
      box();
      expect(screen.getByText(`Saved ✓ ${USER}`)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(screen.queryByText('Needed')).toBeNull();
    });

    it('Change opens the form, and Cancel puts the saved line back', () => {
      box();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.queryByText(`Saved ✓ ${USER}`)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByText(`Saved ✓ ${USER}`)).toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).toBeNull();
    });

    it('says it in Hindi', () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      box();
      expect(screen.getByText(`मिल गया ✓ ${USER}`)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'बदलें' })).toBeInTheDocument();
    });
  });

  describe('someone who is not the owner', () => {
    it('sees "The owner fills this" and no form or Forgot password link', () => {
      h.login.data = login({ canEdit: false });
      box();
      expect(screen.getByText('The owner fills this')).toBeInTheDocument();
      expect(screen.queryByLabelText('User ID')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
    });

    it('sees the saved login but no Change', () => {
      h.login.data = login({ canEdit: false, status: 'saved', username: USER });
      box();
      expect(screen.getByText(`Saved ✓ ${USER}`)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
      expect(screen.queryByText('The owner fills this')).toBeNull();
    });

    it('is not shown a reset another phone started', () => {
      h.login.data = login({ canEdit: false, reset: reset() });
      box();
      expect(screen.queryByText(/OTP sent to/)).toBeNull();
    });
  });

  describe('a touch in the form', () => {
    it('is marked no-swipe and never reaches the bubble underneath', () => {
      const onPointerDown = vi.fn();
      renderWithProviders(
        <div onPointerDown={onPointerDown}>
          <WemmisLoginBox />
        </div>,
      );
      const form = screen.getByLabelText('User ID').closest('form')!;
      expect(form).toHaveAttribute('data-no-swipe');
      fireEvent.pointerDown(screen.getByLabelText('User ID'));
      expect(onPointerDown).not.toHaveBeenCalled();
    });

    it('brings the focused field to the middle once the keyboard is up', () => {
      vi.useFakeTimers();
      const spy = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = spy;
      try {
        box();
        fireEvent.focus(screen.getByLabelText('Password'));
        expect(spy).not.toHaveBeenCalled();
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });
  });
});

describe('WemmisLoginBox — Forgot password', () => {
  it('opens a mobile box: ten digits, a numeric keyboard, and where the number comes from', () => {
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    const mobile = screen.getByLabelText('Mobile number');
    expect(mobile).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByText('The mobile number registered on eMaaptaul')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('keeps Send OTP off until the number is a real Indian mobile', () => {
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    const send = screen.getByRole('button', { name: 'Send OTP' });
    const mobile = screen.getByLabelText('Mobile number');
    expect(send).toBeDisabled();
    fireEvent.change(mobile, { target: { value: '98765' } });
    expect(send).toBeDisabled();
    fireEvent.change(mobile, { target: { value: '5123456789' } });
    expect(send).toBeDisabled();
    fireEvent.change(mobile, { target: { value: MOBILE } });
    expect(send).toBeEnabled();
  });

  it('takes a pasted +91 number and keeps the ten digits', () => {
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    const mobile = screen.getByLabelText('Mobile number');
    fireEvent.change(mobile, { target: { value: '+91 98765 43210' } });
    expect(mobile).toHaveValue(MOBILE);
  });

  it('Back returns to the login form', () => {
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mobile number')).toBeNull();
  });

  it('Send OTP posts the mobile and starts following the reset it gets back', async () => {
    await startReset(reset({ state: 'starting', expiresAt: null, mobileMasked: null }));
    expect(h.start.mutateAsync).toHaveBeenCalledWith({ mobile: MOBILE });
    expect(h.start.reset).toHaveBeenCalled();
  });

  it.each([
    [409, 'A reset is already running. Wait a minute, then try again.'],
    [429, 'Try again in a little while'],
    [500, "Couldn't send — try again"],
  ])('on a %i from Send OTP it says "%s", never the raw error', async (status, words) => {
    h.start.mutateAsync.mockRejectedValue(new ApiError(status, 'X', 'internal detail'));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    expect(await screen.findByText(words)).toBeInTheDocument();
    expect(screen.queryByText(/internal detail/)).toBeNull();
    // Still on the mobile box, with the number kept.
    expect(screen.getByLabelText('Mobile number')).toHaveValue(MOBILE);
  });

  describe('starting', () => {
    it('shows a spinner and "Opening the eMaaptaul site… this can take up to a minute"', async () => {
      await startReset(reset({ state: 'starting', expiresAt: null, mobileMasked: null }));
      const line = screen.getByRole('status');
      expect(line).toHaveTextContent('Opening the eMaaptaul site… this can take up to a minute');
      expect(screen.queryByLabelText(/OTP digit/)).toBeNull();
    });
  });

  describe('otp_sent', () => {
    it('says where the OTP went and shows four one-digit boxes', async () => {
      await startReset(reset());
      expect(screen.getByText('OTP sent to XXXXXX1234')).toBeInTheDocument();
      const boxes = otpBoxes();
      expect(boxes).toHaveLength(4);
      for (const b of boxes) {
        expect(b).toHaveAttribute('inputmode', 'numeric');
        expect(b).toHaveAttribute('pattern', '[0-9]*');
      }
      // Only the first asks the phone for the code from the SMS.
      expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code');
      expect(boxes[1]).toHaveAttribute('autocomplete', 'off');
      expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    });

    it('puts the cursor in the first box', async () => {
      await startReset(reset());
      expect(otpBoxes()[0]).toHaveFocus();
    });

    it('says "your mobile" when the site gave no masked number', async () => {
      await startReset(reset({ mobileMasked: null }));
      expect(screen.getByText('OTP sent to your mobile')).toBeInTheDocument();
    });

    it('counts down to the moment the OTP stops working', () => {
      vi.useFakeTimers({
        toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
      });
      vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
      // Opened on a reset that is already going: nothing to wait for, so no real timers.
      const going = reset({ expiresAt: '2026-11-02T10:01:52Z' });
      h.login.data = login({ reset: going });
      h.reset.data = going;
      box();
      expect(screen.getByText('Time left 1:52')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText('Time left 1:49')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(200_000);
      });
      // Never below zero. The server says when it is over.
      expect(screen.getByText('Time left 0:00')).toBeInTheDocument();
    });

    it('does not send three digits, and sends the fourth by itself', async () => {
      await startReset(reset());
      typeOtp('482');
      expect(h.answer.mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
      typeOtp('4821');
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
      expect(h.answer.mutateAsync).toHaveBeenCalledWith({ otp: '4821' });
    });

    it('moves the cursor on after each digit', async () => {
      await startReset(reset());
      const boxes = otpBoxes();
      fireEvent.change(boxes[0]!, { target: { value: '4' } });
      expect(boxes[1]).toHaveFocus();
      fireEvent.change(boxes[1]!, { target: { value: '8' } });
      expect(boxes[2]).toHaveFocus();
    });

    it('a paste into any box fills all four and sends them', async () => {
      await startReset(reset());
      fireEvent.paste(otpBoxes()[2]!, { clipboardData: { getData: () => ' 4 8 2 1 ' } });
      expect(otpBoxes().map((b) => b.value)).toEqual(['4', '8', '2', '1']);
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledWith({ otp: '4821' }));
    });

    it('takes the whole code the phone fills into the first box', async () => {
      await startReset(reset());
      fireEvent.change(otpBoxes()[0]!, { target: { value: '4821' } });
      expect(otpBoxes().map((b) => b.value)).toEqual(['4', '8', '2', '1']);
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledWith({ otp: '4821' }));
    });

    it('ignores letters', async () => {
      await startReset(reset());
      fireEvent.change(otpBoxes()[0]!, { target: { value: 'x' } });
      expect(otpBoxes()[0]).toHaveValue('');
    });

    it('Backspace in an empty box clears the one before and goes back to it', async () => {
      await startReset(reset());
      typeOtp('48');
      const boxes = otpBoxes();
      expect(boxes[2]).toHaveFocus();
      fireEvent.keyDown(boxes[2]!, { key: 'Backspace' });
      expect(otpBoxes().map((b) => b.value)).toEqual(['4', '', '', '']);
      expect(otpBoxes()[1]).toHaveFocus();
    });

    it('Check sends the code too, and is the way when the fourth digit was corrected', async () => {
      h.answer.mutateAsync.mockRejectedValueOnce(new ApiError(500, 'X', 'detail'));
      await startReset(reset());
      typeOtp('4821');
      await screen.findByText("Couldn't send — try again");
      // Still filled: one tap on Check tries again.
      expect(otpBoxes().map((b) => b.value)).toEqual(['4', '8', '2', '1']);
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(2));
    });

    it('while the answer is going, the boxes are off', async () => {
      h.answer.isPending = true;
      await startReset(reset());
      for (const b of otpBoxes()) expect(b).toBeDisabled();
    });

    it('says "that step is already over" on a 409 and looks again', async () => {
      h.answer.mutateAsync.mockRejectedValue(new ApiError(409, 'X', 'internal detail'));
      await startReset(reset());
      typeOtp('4821');
      expect(
        await screen.findByText('That step is already over. Wait a moment.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/internal detail/)).toBeNull();
      expect(h.reset.refetch).toHaveBeenCalled();
    });
  });

  describe('checking and resetting', () => {
    it('checking is a spinner with words, and no boxes', async () => {
      await startReset(reset({ state: 'checking' }));
      expect(screen.getByRole('status')).toHaveTextContent('Checking your OTP…');
      expect(screen.queryByLabelText(/OTP digit/)).toBeNull();
    });

    it('resetting is a spinner with words', async () => {
      await startReset(reset({ state: 'resetting' }));
      expect(screen.getByRole('status')).toHaveTextContent('Setting your new password…');
    });
  });

  describe('wrong_otp', () => {
    it('says it did not match, with the boxes empty and the cursor in the first', async () => {
      await startReset(reset({ state: 'wrong_otp' }));
      expect(screen.getByText('That OTP did not match. Type it again.')).toBeInTheDocument();
      expect(otpBoxes().map((b) => b.value)).toEqual(['', '', '', '']);
      expect(otpBoxes()[0]).toHaveFocus();
    });

    it('clears what was typed when the state turns into wrong_otp with the boxes still up', async () => {
      const { rerender } = (() => {
        h.start.mutateAsync.mockResolvedValue(login({ reset: reset() }));
        h.reset.data = reset();
        return box();
      })();
      fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
      fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      await screen.findByText('OTP sent to XXXXXX1234');
      h.answer.mutateAsync.mockResolvedValue(undefined);
      typeOtp('4821');
      expect(otpBoxes().map((b) => b.value)).toEqual(['4', '8', '2', '1']);

      h.reset.data = reset({ state: 'wrong_otp' });
      rerender(<WemmisLoginBox />);
      await waitFor(() => expect(otpBoxes().map((b) => b.value)).toEqual(['', '', '', '']));
      expect(screen.getByText('That OTP did not match. Type it again.')).toBeInTheDocument();
    });
  });

  describe('need_captcha', () => {
    const captcha = () =>
      reset({ state: 'need_captcha', captchaImageUrl: 'https://files.example.test/c.png' });

    it('shows the picture, a letters box and the OTP boxes', async () => {
      await startReset(captcha());
      const img = screen.getByRole('img', { name: 'Letters to type' });
      expect(img).toHaveAttribute('src', 'https://files.example.test/c.png');
      expect(screen.getByLabelText('Letters in the picture')).toBeInTheDocument();
      expect(otpBoxes()).toHaveLength(4);
    });

    it('does not send the OTP on its own until the letters are typed', async () => {
      await startReset(captcha());
      typeOtp('4821');
      expect(h.answer.mutateAsync).not.toHaveBeenCalled();
      const check = screen.getByRole('button', { name: 'Check' });
      expect(check).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Letters in the picture'), {
        target: { value: 'aB3x' },
      });
      expect(check).toBeEnabled();
      fireEvent.click(check);
      await waitFor(() =>
        expect(h.answer.mutateAsync).toHaveBeenCalledWith({ otp: '4821', captcha: 'aB3x' }),
      );
    });

    it('sends both together when the letters come first', async () => {
      await startReset(captcha());
      fireEvent.change(screen.getByLabelText('Letters in the picture'), {
        target: { value: ' aB3x ' },
      });
      typeOtp('4821');
      await waitFor(() =>
        expect(h.answer.mutateAsync).toHaveBeenCalledWith({ otp: '4821', captcha: 'aB3x' }),
      );
    });

    it('keeps the digits typed before the site asked for the picture', async () => {
      h.start.mutateAsync.mockResolvedValue(login({ reset: reset() }));
      h.reset.data = reset();
      const { rerender } = box();
      fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
      fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      await screen.findByText('OTP sent to XXXXXX1234');
      typeOtp('48');
      h.reset.data = captcha();
      rerender(<WemmisLoginBox />);
      expect(screen.getByLabelText('Letters in the picture')).toBeInTheDocument();
      expect(otpBoxes().map((b) => b.value)).toEqual(['4', '8', '', '']);
    });
  });

  describe('choose_user', () => {
    it("asks which login is the pump's, one button per user ID", async () => {
      await startReset(reset({ state: 'choose_user', usernames: ['pump-a', 'pump-b'] }));
      expect(
        screen.getByText("Several logins use this mobile. Which one is the pump's?"),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'pump-a' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'pump-b' })).toBeInTheDocument();
    });

    it('posts the user ID that was tapped', async () => {
      await startReset(reset({ state: 'choose_user', usernames: ['pump-a', 'pump-b'] }));
      fireEvent.click(screen.getByRole('button', { name: 'pump-b' }));
      await waitFor(() =>
        expect(h.answer.mutateAsync).toHaveBeenCalledWith({ username: 'pump-b' }),
      );
    });
  });

  describe('done', () => {
    it('says the password is reset and that MDG will download the certificate', async () => {
      await startReset(reset({ state: 'done', expiresAt: null }));
      expect(
        screen.getByText("Password reset. MDG's team will now download your certificate."),
      ).toBeInTheDocument();
    });

    it('asks the server for the login again, once: it is saved now', async () => {
      const { queryClient } = (() => {
        h.start.mutateAsync.mockResolvedValue(login({ reset: reset({ state: 'done' }) }));
        h.reset.data = reset({ state: 'done' });
        return box();
      })();
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
      fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      await screen.findByText(/Password reset/);
      const asks = spy.mock.calls.filter(
        ([f]) => JSON.stringify(f) === JSON.stringify({ queryKey: wemmisLoginKey }),
      );
      expect(asks).toHaveLength(1);
    });

    it('says it in Hindi', async () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      h.start.mutateAsync.mockResolvedValue(login({ reset: reset({ state: 'done' }) }));
      h.reset.data = reset({ state: 'done' });
      box();
      fireEvent.click(screen.getByRole('button', { name: 'पासवर्ड भूल गए?' }));
      fireEvent.change(screen.getByLabelText('मोबाइल नंबर'), { target: { value: MOBILE } });
      fireEvent.click(screen.getByRole('button', { name: 'OTP भेजें' }));
      expect(
        await screen.findByText(
          'पासवर्ड रीसेट हो गया। MDG की टीम अब आपका सर्टिफ़िकेट डाउनलोड करेगी।',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('failed', () => {
    const failed = (message: WemmisResetView['message']) =>
      reset({ state: 'failed', expiresAt: null, message });

    it("shows the server's words in the owner's language, and Try again", async () => {
      await startReset(failed({ en: 'The site is not answering.', hi: 'साइट जवाब नहीं दे रही।' }));
      expect(screen.getByText('The site is not answering.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('shows the Hindi words when the app is in Hindi', async () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      h.start.mutateAsync.mockResolvedValue(login({ reset: failed(null) }));
      h.reset.data = failed({ en: 'The site is not answering.', hi: 'साइट जवाब नहीं दे रही।' });
      box();
      fireEvent.click(screen.getByRole('button', { name: 'पासवर्ड भूल गए?' }));
      fireEvent.change(screen.getByLabelText('मोबाइल नंबर'), { target: { value: MOBILE } });
      fireEvent.click(screen.getByRole('button', { name: 'OTP भेजें' }));
      expect(await screen.findByText('साइट जवाब नहीं दे रही।')).toBeInTheDocument();
    });

    it('has words of its own when the server sent none', async () => {
      await startReset(failed(null));
      expect(screen.getByText('The reset did not go through.')).toBeInTheDocument();
    });

    it('Try again goes back to the mobile box with the number kept', async () => {
      await startReset(failed({ en: 'The site is not answering.', hi: 'x' }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(screen.getByLabelText('Mobile number')).toHaveValue(MOBILE);
    });
  });

  describe('expired', () => {
    it('says time ran out and sends a new OTP to the same mobile', async () => {
      await startReset(reset({ state: 'expired', expiresAt: null }));
      expect(screen.getByText('Time ran out. Send a new OTP.')).toBeInTheDocument();
      h.start.mutateAsync.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      await waitFor(() => expect(h.start.mutateAsync).toHaveBeenCalledWith({ mobile: MOBILE }));
    });

    it('a reset the server no longer holds reads as time run out', async () => {
      h.start.mutateAsync.mockResolvedValue(login({ reset: reset({ state: 'starting' }) }));
      h.reset.data = undefined;
      h.reset.isError = true;
      h.reset.error = new ApiError(404, 'NOT_FOUND', 'gone');
      box();
      fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
      fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      expect(await screen.findByText('Time ran out. Send a new OTP.')).toBeInTheDocument();
    });
  });

  describe('a reset that was already going', () => {
    it('opens on it, and follows it, instead of asking for the mobile again', () => {
      const going = reset();
      h.login.data = login({ reset: going });
      h.reset.data = going;
      box();
      expect(screen.getByText('OTP sent to XXXXXX1234')).toBeInTheDocument();
      expect(screen.queryByLabelText('Mobile number')).toBeNull();
      expect(h.resetCalls).toHaveBeenCalledWith('r1', going);
    });

    it('ignores one that has ended', () => {
      h.login.data = login({ reset: reset({ state: 'done' }) });
      box();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('keeps showing how it ended after the login is asked again and no longer lists it as going', () => {
      const going = reset({ state: 'checking' });
      h.login.data = login({ reset: going });
      h.reset.data = reset({ state: 'done', expiresAt: null });
      const { rerender } = box();
      expect(screen.getByText(/Password reset/)).toBeInTheDocument();

      // A reset that is done has saved the login: the next answer says so, and
      // carries the reset as finished, not going.
      h.login.data = login({
        status: 'saved',
        username: USER,
        reset: reset({ state: 'done', expiresAt: null }),
      });
      rerender(<WemmisLoginBox />);
      expect(screen.getByText(/Password reset/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).toBeNull();
    });

    it('lets the owner back out once it has ended, and does not reopen it', () => {
      // The login view still lists the reset as going (it was not asked again);
      // the reset's own answer says it failed.
      h.login.data = login({ reset: reset({ state: 'starting', expiresAt: null }) });
      h.reset.data = reset({ state: 'failed', expiresAt: null, message: null });
      box();
      expect(screen.queryByLabelText('Password')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.queryByLabelText('Mobile number')).toBeNull();
    });
  });

  it("every state's words are in Hindi too, none left in English", async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    h.reset.data = reset({ state: 'otp_sent', mobileMasked: 'XXXXXX1234' });
    h.login.data = login({ reset: h.reset.data });
    box();
    const form = document.querySelector('[data-wemmis-otp]') as HTMLElement;
    expect(within(form).getByText('XXXXXX1234 पर OTP भेजा गया')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'जाँचें' })).toBeInTheDocument();
    expect(within(form).getByLabelText('OTP का अंक 1 / 4')).toBeInTheDocument();
  });
});
