import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { duOtpKey } from '@/hooks/api/useDuOtp';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import {
  makeDuOtpEntry,
  makeDuOtpFile,
  makeDuOtpGroup,
  makeDuOtpInputs,
  makeDuOtpView,
} from '@/test/duOtpFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import { duOtpAnswerSchema } from '@dk/shared/schemas';
import type { DuOtpAckView, DuOtpGroupView } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; the hooks and the box are the real ones.
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post, put: h.put },
}));

const VIEW_PATH = '/v1/me/du-otp';
const ANSWER_PATH = '/v1/me/du-otp/answer';
const SIGN_PATH = '/v1/uploads/sign';

/** The answers the double will give, in order, and the bodies it was sent. */
let replies: DuOtpAckView[] = [];
let answers: unknown[] = [];

const at = (step: DuOtpGroupView['step'], inputs = makeDuOtpInputs(), state: DuOtpGroupView['state'] = 'collecting') =>
  makeDuOtpView({
    groups: [
      makeDuOtpGroup({
        state,
        step,
        inputs,
        suggestedRemarks: 'DU re-calibrated, e-calibration done.',
        entries: [makeDuOtpEntry({ state: state === 'pending' ? 'pending' : 'collecting' })],
      }),
    ],
  });

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
  replies = [];
  answers = [];
  h.get.mockReset();
  h.put.mockReset();
  h.fetch.mockReset();
  h.fetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
  vi.stubGlobal('fetch', h.fetch);
  h.post.mockReset();
  h.post.mockImplementation(async (path: string, body: unknown) => {
    if (path === SIGN_PATH) {
      return {
        uploadUrl: 'https://s3.example.test/put?sig=1',
        storageKey: 'dealers/d1/du-otp/abc',
        expiresIn: 900,
      };
    }
    if (path === ANSWER_PATH) {
      answers.push(body);
      // Whatever goes to the server must be a body its own schema accepts.
      expect(duOtpAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
      const next = replies.shift();
      if (!next) throw new Error('no reply left in the double');
      return next;
    }
    throw new Error(`unexpected POST ${path}`);
  });
});
afterEach(() => cleanup());

function box(body = "MDG saw a DU OTP event on IndianOil's portal. It must be acknowledged.") {
  const message = makeMessage({
    id: 'du-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body,
    duOtpAck: {},
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

describe('MessageBubble — a DU OTP box MDG posted', () => {
  it('asks for the view only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it("reads the outlet's own view, and draws the words first and the box under them", async () => {
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    const { container } = box();
    await screen.findByRole('button', { name: 'Do it for me' });
    expect(h.get).toHaveBeenCalledWith(VIEW_PATH);
    const words = screen.getByText(/must be acknowledged/);
    const inner = container.querySelector('[data-du-otp]')!;
    expect(words.compareDocumentPosition(inner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws for an empty marker: `duOtpAck: {}` is all the message carries', async () => {
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    const { container } = box();
    await screen.findByRole('button', { name: 'Do it for me' });
    expect(container.querySelectorAll('[data-du-otp]')).toHaveLength(1);
  });

  it('is as wide as a request, with its time on its own line', async () => {
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    const { container } = box();
    await screen.findByRole('button', { name: 'Do it for me' });
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
    expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
  });

  it('is its own box: no other login box is drawn with it, and no other view asked for', async () => {
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    const { container } = box();
    await screen.findByRole('button', { name: 'Do it for me' });
    expect(container.querySelector('[data-portal-login]')).toBeNull();
    expect(container.querySelector('[data-wemmis-login]')).toBeNull();
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('draws the LIVE view: an old box says "nothing pending" once the events are all closed', async () => {
    h.get.mockResolvedValue(makeDuOtpView());
    box();
    expect(await screen.findByText('No DU OTP acknowledgement is pending')).toBeInTheDocument();
  });

  it('asks again when the cache is told the outlet moved (a box arrived, a socket event, a reconnect)', async () => {
    h.get.mockResolvedValueOnce(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    const { queryClient } = box();
    await screen.findByRole('button', { name: 'Do it for me' });
    h.get.mockResolvedValue(at('certificate'));
    await queryClient.invalidateQueries({ queryKey: duOtpKey });
    expect(await screen.findByText('Step 2 of 5')).toBeInTheDocument();
  });

  it('every box in a thread shares one view and one answer', async () => {
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    renderWithProviders(
      <>
        <MessageBubble
          message={makeMessage({ id: 'du-a', body: 'first', senderRole: 'admin', duOtpAck: {} })}
          mine={false}
        />
        <MessageBubble
          message={makeMessage({ id: 'du-b', body: 'second', senderRole: 'admin', duOtpAck: {} })}
          mine={false}
        />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Do it for me' })).toHaveLength(2));
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('a manager who is refused is told in the server\'s own plain words', async () => {
    signIn({ role: 'dealer-staff', dealerId: 'd1' });
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    h.post.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Only the owner can do this.'));
    box();
    fireEvent.click(await screen.findByRole('button', { name: 'Do it for me' }));
    expect(await screen.findByText('Only the owner can do this.')).toBeInTheDocument();
  });

  // The whole road once, through the real hooks: "Do it for me" → reasons →
  // certificate (a PDF) → service report (a photo) → no other paper → remark →
  // review → submit. Each answer's reply is the whole fresh view, which is what
  // moves the box on; the view is never asked for again on the way.
  it('walks the whole road, one answer per step, and posts exactly what the contract says', async () => {
    h.get.mockResolvedValue(
      makeDuOtpView({ groups: [makeDuOtpGroup()], supplyBlockedForOtp: true }),
    );
    const cert = makeDuOtpFile({ key: 'dealers/d1/du-otp/abc', filename: 'cert.pdf' });
    const report = makeDuOtpFile({ key: 'dealers/d1/du-otp/abc', filename: 'report.jpg', url: null });
    const withReasons = makeDuOtpInputs({ reasons: ['e_calibration', 'Replacement'] });
    const withCert = makeDuOtpInputs({ ...withReasons, certificate: cert });
    const withReport = makeDuOtpInputs({ ...withCert, serviceReport: report });
    const withSkip = makeDuOtpInputs({ ...withReport, otherSkipped: true });
    const withRemarks = makeDuOtpInputs({ ...withSkip, remarks: 'Pulsar replaced by the engineer.' });
    replies = [
      at('reasons'),
      at('certificate', withReasons),
      at('serviceReport', withCert),
      at('other', withReport),
      at('remarks', withSkip),
      at('review', withRemarks),
      at('review', withRemarks, 'submitting'),
    ];

    box();

    // Pending: the one button.
    expect(
      await screen.findByText('IndianOil has stopped your fuel supply until this is done.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Do it for me' }));

    // 1. Reasons.
    expect(await screen.findByText('Step 1 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('A part was replaced'));
    fireEvent.click(screen.getByLabelText('e-Calibration'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // 2. Certificate: a PDF through the presigned upload.
    expect(await screen.findByText('Step 2 of 5')).toBeInTheDocument();
    const pdf = new File(['%PDF-1.4'], 'cert.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [pdf] } });

    // 3. Service report: a photo.
    expect(await screen.findByText('Step 3 of 5')).toBeInTheDocument();
    const photo = new File([new Uint8Array([1, 2, 3])], 'report.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [photo] } });

    // 4. Nothing else.
    expect(await screen.findByText('Step 4 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'No other document' }));

    // 5. The remark, from the suggestion.
    expect(await screen.findByText('Step 5 of 5')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Remark'), {
      target: { value: 'Pulsar replaced by the engineer.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Review, then submit.
    expect(await screen.findByText('Check and submit')).toBeInTheDocument();
    expect(screen.getByText('e-Calibration, A part was replaced')).toBeInTheDocument();
    expect(screen.getByText('Pulsar replaced by the engineer.')).toBeInTheDocument();
    expect(screen.getByText('22-10-2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit to IndianOil' }));
    expect(await screen.findByText('Submitting to IndianOil…')).toBeInTheDocument();

    expect(answers).toEqual([
      { step: 'start' },
      { step: 'reasons', group: 'GB12345', reasons: ['e_calibration', 'Replacement'] },
      {
        step: 'file',
        group: 'GB12345',
        slot: 'certificate',
        key: 'dealers/d1/du-otp/abc',
        filename: 'cert.pdf',
      },
      {
        step: 'file',
        group: 'GB12345',
        slot: 'serviceReport',
        key: 'dealers/d1/du-otp/abc',
        filename: 'report.jpg',
      },
      { step: 'other_skip', group: 'GB12345' },
      { step: 'remarks', group: 'GB12345', remarks: 'Pulsar replaced by the engineer.' },
      { step: 'submit', group: 'GB12345' },
    ]);

    // Both files went through the ordinary presign and PUT, as the kind they are.
    const signs = h.post.mock.calls.filter(([p]) => p === SIGN_PATH).map(([, b]) => b);
    expect(signs).toEqual([
      { filename: 'cert.pdf', contentType: 'application/pdf', size: pdf.size, scope: 'du-otp', dealerId: 'd1' },
      { filename: 'report.jpg', contentType: 'image/jpeg', size: photo.size, scope: 'du-otp', dealerId: 'd1' },
    ]);
    expect(h.fetch).toHaveBeenNthCalledWith(1, 'https://s3.example.test/put?sig=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
    });
    expect(h.fetch).toHaveBeenNthCalledWith(2, 'https://s3.example.test/put?sig=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: photo,
    });

    // The view was read once; every step after came with the answer.
    expect(h.get).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('a refused upload posts no answer, says so, and the owner can try again', async () => {
    h.get.mockResolvedValue(at('serviceReport'));
    h.fetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    box();
    await screen.findByText('Step 3 of 5');
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), {
      target: { files: [new File(['%PDF'], 'r.pdf', { type: 'application/pdf' })] },
    });
    expect(
      await screen.findByText('The upload did not go through. Check your network and try again.'),
    ).toBeInTheDocument();
    expect(answers).toEqual([]);
    expect(screen.getByLabelText('Upload PDF or photo')).toBeEnabled();
  });

  it('a Word file is turned away before anything is sent', async () => {
    h.get.mockResolvedValue(at('serviceReport'));
    box();
    await screen.findByText('Step 3 of 5');
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), {
      target: {
        files: [
          new File(['x'], 'r.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
        ],
      },
    });
    expect(await screen.findByText('Choose a PDF or a photo (JPEG, PNG or WebP).')).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('a 409 (the step had already moved) shows the words and looks again at where things stand', async () => {
    h.get.mockResolvedValueOnce(at('reasons'));
    h.post.mockRejectedValue(new ApiError(409, 'MOVED', 'That step was already answered on another phone.'));
    box();
    await screen.findByText('Step 1 of 5');
    h.get.mockResolvedValue(at('certificate'));
    fireEvent.click(screen.getByLabelText('Something else'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 5')).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it('says the whole box in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    box();
    expect(await screen.findByRole('button', { name: 'मेरे लिए कर दो' })).toBeInTheDocument();
  });
});
