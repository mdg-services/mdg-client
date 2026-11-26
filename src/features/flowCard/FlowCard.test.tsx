import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pickedChoice } from '@/features/chat/ReplyChoices';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import type { FlowCardView } from '@dk/shared/types';

import { FlowCardMessage } from './FlowCard';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post },
}));

const w = (hi: string, hl: string, en: string) => ({ hi, hl, en });

function card(over: Partial<FlowCardView> = {}): FlowCardView {
  return {
    flow: 'fuel_order',
    ref: 'd1',
    liveMessageId: 'm-card',
    title: w('नया लोड ऑर्डर', 'Naya load order', 'New fuel order'),
    meta: '904S · 4:10 pm',
    progress: null,
    status: 'asking',
    rows: [
      { key: 'lines', label: w('कितना लोड?', 'Kitna load?', 'How much?'), state: 'open' },
      {
        key: 'kl:HSD',
        label: w('डीज़ल', 'Diesel', 'Diesel'),
        state: 'open',
        part: true,
        choices: [
          { value: '4', label: '4' },
          { value: '8', label: '8' },
          { value: '12', label: '12' },
        ],
        typed: { kind: 'number', unit: 'KL', min: 1, max: 100, decimals: 1 },
      },
      {
        key: 'delivery_date',
        label: w('कब चाहिए?', 'Kab chahiye?', 'For which day?'),
        state: 'done',
        answer: w('कल · 27 नवंबर', 'Kal · 27 Nov', 'Tomorrow · 27 Nov'),
        canChange: true,
        choices: [{ value: '2026-11-27', label: w('कल', 'Kal', 'Tomorrow'), selected: true }],
      },
    ],
    summary: [],
    warnings: [],
    problem: null,
    actions: [{ id: 'drop', label: w('रहने दीजिए', 'Rehne dijiye', 'Not now'), tone: 'secondary' }],
    canAnswer: true,
    stamp: '',
    video: null,
    ...over,
  };
}

const msg = (id = 'm-card') => makeMessage({ id, senderRole: 'admin', system: true, body: 'x', flowCard: { flow: 'fuel_order', ref: 'd1' } });

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'dl1' });
  useLangStore.setState({ lang: 'hl' });
  h.get.mockReset();
  h.post.mockReset();
});
afterEach(cleanup);

describe('the living card (ADR 0059)', () => {
  it('paints every question as a row: open pills, and a done row as a tick with its answer', async () => {
    h.get.mockResolvedValue(card());
    renderWithProviders(<FlowCardMessage message={msg()} />);
    const c = await screen.findByTestId('flow-card');
    expect(within(c).getByText('Naya load order')).toBeTruthy();
    expect(within(c).getByText('904S · 4:10 pm')).toBeTruthy();
    expect(c.querySelector('[data-row="lines"]')?.getAttribute('data-state')).toBe('open');
    expect(c.querySelector('[data-row="delivery_date"]')?.getAttribute('data-state')).toBe('done');
    expect(within(c).getByText('Kal · 27 Nov')).toBeTruthy();
    // A fuel's pills, unpicked.
    const part = screen.getByTestId('flow-part-kl:HSD');
    expect(within(part).getByRole('button', { name: '8' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('sends a tap as an answer to its row, and paints the card the server answers with', async () => {
    h.get.mockResolvedValue(card());
    const after = card({
      rows: card().rows.map((r) =>
        r.key === 'kl:HSD'
          ? { ...r, state: 'done' as const, choices: r.choices!.map((c) => ({ ...c, selected: c.value === '8' })) }
          : r.key === 'lines'
            ? { ...r, state: 'done' as const, answer: w('डीज़ल 8 KL', 'Diesel 8 KL', 'Diesel 8 KL') }
            : r,
      ),
    });
    h.post.mockResolvedValue({ card: after });
    renderWithProviders(<FlowCardMessage message={msg()} />);
    const part = await screen.findByTestId('flow-part-kl:HSD');
    fireEvent.click(within(part).getByRole('button', { name: '8' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/flow-cards/fuel_order/d1/answer', { row: 'kl:HSD', value: '8' }));
    await waitFor(() => expect(within(screen.getByTestId('flow-part-kl:HSD')).getByRole('button', { name: '8' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('a second tap on the picked amount takes the fuel off (value 0)', async () => {
    const picked = card({
      rows: card().rows.map((r) => (r.key === 'kl:HSD' ? { ...r, state: 'done' as const, choices: r.choices!.map((c) => ({ ...c, selected: c.value === '4' })) } : r)),
    });
    h.get.mockResolvedValue(picked);
    h.post.mockResolvedValue({ card: card() });
    renderWithProviders(<FlowCardMessage message={msg()} />);
    const part = await screen.findByTestId('flow-part-kl:HSD');
    fireEvent.click(within(part).getByRole('button', { name: '4' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/flow-cards/fuel_order/d1/answer', { row: 'kl:HSD', value: '0' }));
  });

  it('a refusal comes back in the reader’s own language, under the row', async () => {
    h.get.mockResolvedValue(card());
    h.post.mockRejectedValue(
      new ApiError(400, 'BAD_REQUEST', 'x', { code: 'invalid', words: w('हिंदी', 'Yeh matra nahi lag sakti.', 'English') }),
    );
    renderWithProviders(<FlowCardMessage message={msg()} />);
    const part = await screen.findByTestId('flow-part-kl:HSD');
    fireEvent.click(within(part).getByRole('button', { name: '12' }));
    expect(await screen.findByText('Yeh matra nahi lag sakti.')).toBeTruthy();
  });

  it('paints nothing on an older message: the card lives on the newest one only', async () => {
    h.get.mockResolvedValue(card({ liveMessageId: 'm-newer' }));
    const { container } = renderWithProviders(<FlowCardMessage message={msg('m-older')} />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[data-testid="flow-card"]')).toBeNull());
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('a refused order: the red row with its sentence, "Dobara lagaiye" and "MDG se baat"', async () => {
    const onSay = vi.fn();
    h.get.mockResolvedValue(
      card({
        status: 'problem',
        rows: [{ key: 'lines', label: w('कितना लोड?', 'Kitna load?', 'How much?'), state: 'done', answer: w('डीज़ल 12 KL', 'Diesel 12 KL', 'Diesel 12 KL') }],
        problem: { text: w('पोर्टल ने…', 'Portal ne order nahi liya — khate mein ₹8.55 lakh kam hain.', 'The portal…'), detail: [] },
        actions: [
          { id: 'retry', label: w('दोबारा लगाइए', 'Dobara lagaiye', 'Try again'), tone: 'primary' },
          { id: 'talk', label: w('MDG से बात', 'MDG se baat', 'Talk to MDG'), tone: 'secondary', say: w('…', 'MDG team se baat karni hai — load order ke baare mein.', '…') },
        ],
      }),
    );
    h.post.mockResolvedValue({ card: card({ status: 'closed', actions: [] }), nextRef: 'd2' });
    renderWithProviders(<FlowCardMessage message={msg()} onSay={onSay} />);
    expect((await screen.findByTestId('flow-problem')).textContent).toContain('₹8.55 lakh');
    fireEvent.click(screen.getByTestId('flow-action-talk'));
    expect(onSay).toHaveBeenCalledWith('MDG team se baat karni hai — load order ke baare mein.', 'm-card');
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('flow-action-retry'));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/flow-cards/fuel_order/d1/action', { action: 'retry', stamp: '' }));
  });

  it('a manager sees the card read-only: no pill can be tapped', async () => {
    h.get.mockResolvedValue(card({ canAnswer: false, actions: [] }));
    renderWithProviders(<FlowCardMessage message={msg()} />);
    const part = await screen.findByTestId('flow-part-kl:HSD');
    expect((within(part).getByRole('button', { name: '8' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Is card ka jawab owner denge')).toBeTruthy();
  });
});

describe('an answer in the dealer’s own words (owner, 26 Nov 2026)', () => {
  it('every question with choices offers "Kuch aur? Likhiye"; the words go to the chat, quoting the card', async () => {
    const onSay = vi.fn();
    const open = card({
      rows: card().rows.map((r) => (r.key === 'delivery_date' ? { ...r, state: 'open' as const, answer: undefined } : r)),
    });
    h.get.mockResolvedValue(open);
    renderWithProviders(<FlowCardMessage message={msg()} onSay={onSay} />);
    const row = await screen.findByTestId('flow-row-delivery_date');
    fireEvent.click(within(row).getByRole('button', { name: 'Kab chahiye?: Apne shabdon mein jawab likhiye' }));
    fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'Somvaar subah tak chahiye' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Bhejein' }));
    expect(onSay).toHaveBeenCalledWith('Somvaar subah tak chahiye', 'm-card');
    expect(h.post).not.toHaveBeenCalled();
    expect(within(row).getByRole('status').textContent).toBe('Bhej diya. Hum ise isi card mein bhar denge.');
  });

  it('on a fuel: a number goes to the row like a tap; words go to the chat with the fuel’s name', async () => {
    const onSay = vi.fn();
    h.get.mockResolvedValue(card());
    h.post.mockResolvedValue({ card: card() });
    renderWithProviders(<FlowCardMessage message={msg()} onSay={onSay} />);
    const part = await screen.findByTestId('flow-part-kl:HSD');
    fireEvent.click(within(part).getByTestId('own-words'));
    fireEvent.change(within(part).getByRole('textbox'), { target: { value: '9 KL' } });
    fireEvent.click(within(part).getByRole('button', { name: 'Bhejein' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/flow-cards/fuel_order/d1/answer', { row: 'kl:HSD', value: '9' }));
    expect(onSay).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId('flow-part-kl:HSD')).getByTestId('own-words'));
    fireEvent.change(within(screen.getByTestId('flow-part-kl:HSD')).getByRole('textbox'), { target: { value: 'jitna tank mein aaye' } });
    fireEvent.click(within(screen.getByTestId('flow-part-kl:HSD')).getByRole('button', { name: 'Bhejein' }));
    expect(onSay).toHaveBeenCalledWith('Diesel: jitna tank mein aaye', 'm-card');
  });

  it('a manager is not offered it: the card is the owner’s to answer', async () => {
    h.get.mockResolvedValue(card({ canAnswer: false, actions: [] }));
    renderWithProviders(<FlowCardMessage message={msg()} onSay={vi.fn()} />);
    await screen.findByTestId('flow-card');
    expect(screen.queryAllByTestId('own-words')).toHaveLength(0);
  });
});

describe('the AI’s answer buttons, once answered', () => {
  const choices = {
    key: 'ai_question',
    options: [
      { value: 'answer_1', label: { hl: 'Haan' } },
      { value: 'answer_2', label: { hl: 'Nahi, kal ki' } },
    ],
  };
  it('names the button the reply matches, whatever its case and stops', () => {
    expect(pickedChoice(choices, 'nahi kal ki!', 'hl')).toBe('Nahi, kal ki');
    expect(pickedChoice(choices, 'HAAN', 'hl')).toBe('Haan');
  });
  it('names nothing for a reply in other words', () => {
    expect(pickedChoice(choices, 'pata nahi', 'hl')).toBeNull();
    expect(pickedChoice(choices, undefined, 'hl')).toBeNull();
  });
});
