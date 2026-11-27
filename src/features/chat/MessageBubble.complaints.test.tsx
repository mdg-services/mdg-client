import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { complaintsKey } from '@/hooks/api/useComplaints';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import {
  makeComplaintOption,
  makeComplaintQuestion,
  makeComplaintSteps,
  makeComplaintView,
  makeComplaintsMe,
} from '@/test/complaintsFixtures';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import { complaintAnswerSchema } from '@dk/shared/schemas';
import type { ComplaintDealerView, ComplaintsMeView } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; the hooks and the box are the real ones.
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post },
}));

const VIEW_PATH = '/v1/me/complaints';
const ANSWER_PATH = '/v1/me/complaints/answer';

let replies: Array<ComplaintsMeView | ComplaintDealerView | Error> = [];
let answers: unknown[] = [];

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
  replies = [];
  answers = [];
  h.get.mockReset();
  h.post.mockReset();
  h.post.mockImplementation(async (path: string, body: unknown) => {
    if (path !== ANSWER_PATH) throw new Error(`unexpected POST ${path}`);
    answers.push(body);
    // Whatever goes to the server must be a body its own schema accepts.
    expect(complaintAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    const next = replies.shift();
    if (!next) throw new Error('no reply left in the double');
    if (next instanceof Error) throw next;
    return next;
  });
});
afterEach(() => cleanup());

function box(id = 'm1', complaintId = 'c1') {
  const message = makeMessage({
    id,
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'Which card machine?',
    complaint: { complaintId, event: 'question' },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

describe('MessageBubble — a complaint box MDG posted', () => {
  it('asks for the view only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it('draws the live box only on the message the view names, and nothing extra on another', async () => {
    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView({ liveMessageId: 'm1' })));
    const live = box('m1');
    await screen.findByText('Machine ending 773');
    expect(live.container.querySelectorAll('[data-complaint]')).toHaveLength(1);
    expect(live.container.innerHTML).toContain('w-[min(80%,330px)]');
    cleanup();

    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView({ liveMessageId: 'm9' })));
    const old = box('m1');
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    await screen.findByText('Which card machine?');
    expect(old.container.querySelector('[data-complaint]')).toBeNull();
    expect(screen.queryByText('Machine ending 773')).toBeNull();
  });

  it('draws nothing on a complaint message while the list loads or when it fails to load', async () => {
    let release: (v: ComplaintsMeView) => void = () => undefined;
    h.get.mockReturnValue(new Promise<ComplaintsMeView>((r) => (release = r)));
    const loading = box('m1');
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(loading.container.querySelector('[data-complaint]')).toBeNull();
    release(makeComplaintsMe(makeComplaintView({ liveMessageId: 'm9' })));
    cleanup();

    h.get.mockReset();
    h.get.mockRejectedValue(new ApiError(500, 'server_error', 'boom'));
    const failed = box('m1');
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(failed.container.querySelector('[data-complaint]')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('answers option, many options, typed text, confirm, change, cancel, ack and check-now with valid bodies', async () => {
    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView()));
    const { queryClient } = box();
    const move = async (view: ComplaintDealerView) => {
      queryClient.setQueryData(complaintsKey, makeComplaintsMe(view));
    };

    replies.push(makeComplaintsMe(makeComplaintView({ screen: 'filing', question: undefined })));
    fireEvent.click(await screen.findByText('Machine ending 774'));
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(answers[0]).toEqual({ step: 'option', complaintId: 'c1', questionId: 'q1', optionId: 't2' });
    expect(await screen.findByRole('status')).toBeInTheDocument();

    // many answers: chips toggle, Done sends them together
    await move(
      makeComplaintView({
        question: makeComplaintQuestion({
          id: 'q2',
          multi: true,
          options: [makeComplaintOption('p1', 'Petrol'), makeComplaintOption('p2', 'Diesel')],
        }),
      }),
    );
    const done = await screen.findByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    fireEvent.click(screen.getByText('Petrol'));
    fireEvent.click(screen.getByText('Diesel'));
    fireEvent.click(screen.getByText('Diesel'));
    expect(screen.getByText('Petrol').closest('button')).toHaveAttribute('aria-pressed', 'true');
    replies.push(makeComplaintsMe(makeComplaintView({ screen: 'filing', question: undefined })));
    fireEvent.click(done);
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(answers[1]).toEqual({ step: 'options', complaintId: 'c1', questionId: 'q2', optionIds: ['p1'] });

    // a number
    await move(makeComplaintView({ question: makeComplaintQuestion({ id: 'q3', options: [], input: 'number' }) }));
    const field = await screen.findByPlaceholderText('Type a number');
    fireEvent.change(field, { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '12.5' } });
    replies.push(makeComplaintsMe(makeComplaintView({ screen: 'filing', question: undefined })));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(answers).toHaveLength(3));
    expect(answers[2]).toEqual({ step: 'text', complaintId: 'c1', questionId: 'q3', text: '12.5' });

    // confirm / change / cancel
    const confirmView = makeComplaintView({
      screen: 'confirm',
      question: undefined,
      summary: [{ label: { en: 'Machine' }, value: { en: 'Ending 774' } }],
    });
    await move(confirmView);
    expect(await screen.findByText('Ending 774')).toBeInTheDocument();
    replies.push(makeComplaintsMe(confirmView), makeComplaintsMe(confirmView), makeComplaintsMe(confirmView));
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    await waitFor(() => expect(answers).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(answers).toHaveLength(5));
    fireEvent.click(screen.getByRole('button', { name: 'Leave it' }));
    await waitFor(() => expect(answers).toHaveLength(6));
    expect(answers.slice(3)).toEqual([
      { step: 'confirm', complaintId: 'c1' },
      { step: 'change', complaintId: 'c1' },
      { step: 'cancel', complaintId: 'c1' },
    ]);

    // ack yes / no
    const ackView = makeComplaintView({
      screen: 'ack',
      question: undefined,
      steps: makeComplaintSteps(['done', 'done', 'done', 'todo']),
    });
    await move(ackView);
    expect(await screen.findByText('Is it working now?')).toBeInTheDocument();
    replies.push(makeComplaintsMe(ackView), makeComplaintsMe(ackView));
    fireEvent.click(screen.getByRole('button', { name: "Yes, it's fixed" }));
    await waitFor(() => expect(answers).toHaveLength(7));
    fireEvent.click(screen.getByRole('button', { name: 'No, still not working' }));
    await waitFor(() => expect(answers).toHaveLength(8));
    expect(answers.slice(6)).toEqual([
      { step: 'ack', complaintId: 'c1', fixed: true },
      { step: 'ack', complaintId: 'c1', fixed: false },
    ]);

    // check now
    await move(
      makeComplaintView({
        screen: 'tracking',
        question: undefined,
        canCheckNow: true,
        steps: makeComplaintSteps(),
      }),
    );
    replies.push(makeComplaintsMe(makeComplaintView({ screen: 'tracking', canCheckNow: false, steps: makeComplaintSteps() })));
    fireEvent.click(await screen.findByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(answers).toHaveLength(9));
    expect(answers[8]).toEqual({ step: 'check_now', complaintId: 'c1' });
  });

  it('disables every button while an answer is on its way: no double move', async () => {
    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView()));
    box();
    let release: (v: ComplaintsMeView) => void = () => undefined;
    h.post.mockImplementationOnce(
      () => new Promise<ComplaintsMeView>((r) => { release = r; }),
    );
    fireEvent.click(await screen.findByText('Machine ending 773'));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Machine ending 774').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Machine ending 774'));
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Machine ending 774').closest('button')).toBeDisabled();
    release(makeComplaintsMe(makeComplaintView({ screen: 'filing', question: undefined })));
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows the tracker with times, the engineer as plain text (no link), and no buttons when finished', async () => {
    h.get.mockResolvedValue(
      makeComplaintsMe(
        makeComplaintView({
          screen: 'tracking',
          stage: 'assigned',
          question: undefined,
          number: 'T-4412',
          steps: makeComplaintSteps(['done', 'current', 'todo', 'todo'], ['2026-11-22T06:00:00.000Z']),
          engineer: { name: 'Ramesh', phone: '9876543210', etaHours: 24 },
        }),
      ),
    );
    const { container } = box();
    expect(await screen.findByText('Ramesh')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.getByText('Will come within 24 hours')).toBeInTheDocument();
    expect(screen.getByText(/Complaint number T-4412/)).toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
    const rows = [...container.querySelectorAll('[data-complaint-step]')];
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['done', 'current', 'todo', 'todo']);
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
  });

  it('a 409 refetches and says nothing; another refusal shows its plain sentence', async () => {
    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView()));
    box();
    replies.push(new ApiError(409, 'conflict', 'moved'));
    fireEvent.click(await screen.findByText('Machine ending 773'));
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();

    replies.push(new ApiError(422, 'bad', 'That is not a number we can use.'));
    fireEvent.click(await screen.findByText('Machine ending 774'));
    expect(await screen.findByRole('alert')).toHaveTextContent('That is not a number we can use.');
  });

  it('speaks the reader language from the view words', async () => {
    useLangStore.setState({ lang: 'hl', explicit: true });
    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView()));
    box();
    expect(await screen.findByText('Kaunsi card machine?')).toBeInTheDocument();
    expect(screen.getByText('Machine ending 773 (hl)')).toBeInTheDocument();
  });

  it('a tap in the box never reaches the message (no reply swipe)', async () => {
    h.get.mockResolvedValue(makeComplaintsMe(makeComplaintView()));
    const { container } = box();
    await screen.findByText('Machine ending 773');
    const outer = vi.fn();
    document.body.addEventListener('pointerdown', outer);
    const el = container.querySelector('[data-complaint]')!;
    expect(el.hasAttribute('data-no-swipe')).toBe(true);
    fireEvent.pointerDown(screen.getByText('Machine ending 773'));
    expect(outer).not.toHaveBeenCalled();
  });
});
