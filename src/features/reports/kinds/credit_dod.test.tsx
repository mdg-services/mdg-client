import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { CreditDodData } from '@dk/shared/types';

import { creditData, reportOf } from './_tankerMoney.fixtures';
import { isLocked, liveCredit, statusOf, view } from './credit_dod';

function open(data: CreditDodData, lang: 'hi' | 'hl' | 'en' = 'en') {
  // The kit's own words follow the app's language.
  useLangStore.setState({ lang });
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('credit_dod')} lang={lang} />);
}

// The fixtures are cards made on 24 Nov: the clock is held on that day (in India), and the tests
// that move it say so.
const ON = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => {
  vi.useFakeTimers();
  ON('2026-11-24T06:00:00.000Z');
});
afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

const overdue = creditData({
  verdict: 'overdue',
  money: {
    amount: 230000,
    dueAmount: 124000,
    date: '2026-11-18',
    daysLeft: -6,
    dateIsApprox: false,
    daysIsMinimum: false,
    deadlines: 2,
  },
});
const lag = creditData({
  verdict: 'overdue_lag',
  money: {
    amount: 124000,
    dueAmount: 124000,
    date: '2026-11-23',
    daysLeft: -1,
    dateIsApprox: false,
    daysIsMinimum: false,
    deadlines: 1,
  },
});
const advance = creditData({
  verdict: 'advance',
  money: {
    amount: 29670,
    dueAmount: -29670,
    date: null,
    daysLeft: null,
    dateIsApprox: false,
    daysIsMinimum: false,
    deadlines: null,
  },
});
const settled = creditData({
  verdict: 'settled',
  money: {
    amount: 0,
    dueAmount: 0,
    date: null,
    daysLeft: null,
    dateIsApprox: false,
    daysIsMinimum: false,
    deadlines: null,
  },
});
const locked = creditData({
  review: { on: '2026-11-18', daysUntil: -6, lapsed: true },
  limit: {
    form: 'CASH & CARRY',
    current: 6000000,
    availed: 4725310.4,
    available: 1274689.6,
    usedPct: null,
  },
});

describe('credit_dod: the hero', () => {
  it('a normal deposit says the date and the days left, measured from the report date', () => {
    open(creditData());
    const hero = screen.getByTestId('credit-hero');
    expect(hero).toHaveAttribute('data-verdict', 'due');
    expect(within(hero).getByText('Deposit by 27 Nov')).toBeInTheDocument();
    expect(within(hero).getByTestId('credit-amount')).toHaveTextContent('₹1,24,000');
    expect(within(hero).getByText('by 27 Nov')).toBeInTheDocument();
    expect(within(hero).getByText('3 days left')).toBeInTheDocument();
    expect(within(hero).getByText('To deposit')).toBeInTheDocument();
    expect(hero.querySelector('[data-status="info"]')).not.toBeNull();
  });

  it('counts the days again from the date, so an older card never prints a stale count', () => {
    // Made on 20 Nov with 7 days to go; it is 24 Nov now, so 3 days are left.
    open(
      creditData({
        asOf: '2026-11-20',
        money: { ...creditData().money, daysLeft: 7, date: '2026-11-27' },
      }),
    );
    expect(screen.getByText('3 days left')).toBeInTheDocument();
    expect(screen.queryByText('7 days left')).toBeNull();
  });

  it('says last day tomorrow in words', () => {
    open(creditData({ money: { ...creditData().money, daysLeft: 1, date: '2026-11-25' } }));
    expect(screen.getByText('last day tomorrow')).toBeInTheDocument();
  });

  it('overdue is a red amount with an octagon and a word, and explains the part', () => {
    open(overdue);
    const hero = screen.getByTestId('credit-hero');
    expect(hero.querySelector('[data-status="problem"]')).not.toBeNull();
    expect(within(hero).getByText('Overdue', { selector: 'span span' })).toBeInTheDocument();
    expect(within(hero).getByTestId('credit-amount')).toHaveTextContent('₹2,30,000');
    expect(within(hero).getByTestId('credit-amount').className).toContain(
      'text-status-problem-ink',
    );
    expect(within(hero).getByText('Deadline was 18 Nov')).toBeInTheDocument();
    expect(within(hero).getByText('6 days overdue')).toBeInTheDocument();
    expect(within(hero).getByText('Covers 2 missed deadlines')).toBeInTheDocument();
    expect(
      within(hero).getByText(
        'Part of this: ₹1,24,000 is the oldest due, the rest is also overdue.',
      ),
    ).toBeInTheDocument();
  });

  it('says "at least" when only a floor is known', () => {
    open({ ...overdue, money: { ...overdue.money, daysIsMinimum: true, dateIsApprox: true } });
    expect(screen.getByText('At least 6 days overdue')).toBeInTheDocument();
    expect(screen.getByText('Deadline was about 18 Nov')).toBeInTheDocument();
  });

  it('inside the portal lag it is amber, softer, and never accusing', () => {
    open(lag);
    const hero = screen.getByTestId('credit-hero');
    expect(hero.querySelector('[data-status="attention"]')).not.toBeNull();
    expect(within(hero).getByTestId('credit-amount').className).toContain(
      'text-status-attention-ink',
    );
    expect(within(hero).getByText('Your payment may not be posted yet.')).toBeInTheDocument();
    expect(screen.queryByText(/missed deadlines/)).toBeNull();
  });

  it('an advance is a positive amount in words, with no minus sign', () => {
    open(advance);
    expect(screen.getByText('IndianOil holds your advance')).toBeInTheDocument();
    expect(screen.getByTestId('credit-amount')).toHaveTextContent('₹29,670');
    expect(document.body.textContent).not.toMatch(/[−-]₹/);
  });

  it('settled says No dues and never ₹0', () => {
    open(settled);
    expect(screen.getByTestId('credit-amount')).toHaveTextContent('No dues');
    expect(screen.getByText('Nothing is due on your IndianOil account.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('₹0');
  });

  it('shows paise only when there are any', () => {
    open(creditData({ money: { ...creditData().money, amount: 124000.5 } }));
    expect(screen.getByTestId('credit-amount')).toHaveTextContent('₹1,24,000.50');
  });

  it('writes the hero in Hindi', () => {
    open(creditData(), 'hi');
    expect(screen.getByText('27 नवंबर तक जमा करें')).toBeInTheDocument();
    expect(screen.getByText('3 दिन बाकी')).toBeInTheDocument();
  });
});

describe('credit_dod: the ring', () => {
  it('draws the share of the limit used, with a text equivalent and the figures beside it', () => {
    open(creditData());
    const ring = screen.getByTestId('limit-ring');
    expect(ring).toHaveAttribute('role', 'img');
    expect(ring).toHaveAttribute('aria-label', 'Used 79 percent of the limit');
    expect(ring).toHaveTextContent('79%');
    expect(screen.getByText('Used ₹47.25 L')).toBeInTheDocument();
    expect(screen.getByText('Left ₹12.75 L')).toBeInTheDocument();
  });

  it('draws no ring when nothing is used and the credit is not locked', () => {
    open(
      creditData({
        limit: { ...creditData().limit, usedPct: null, availed: 0, available: 6000000 },
      }),
    );
    expect(screen.queryByTestId('limit-ring')).toBeNull();
    expect(screen.getByTestId('limit-figures')).toBeInTheDocument();
  });

  it('adds a notch pattern and a triangle with words at 85 percent or more', () => {
    const { container } = open(creditData({ limit: { ...creditData().limit, usedPct: 91 } }));
    expect(container.querySelectorAll('[data-testid="limit-ring"] svg > line').length).toBe(36);
    expect(screen.getByText('The limit is nearly full')).toBeInTheDocument();
    const plain = open(creditData({ limit: { ...creditData().limit, usedPct: 60 } }));
    expect(plain.container.querySelectorAll('[data-testid="limit-ring"] svg > line')).toHaveLength(
      0,
    );
  });

  it('locked: a hatched ring with a padlock, a lock band and the one action', () => {
    const { container } = open(locked);
    expect(isLocked(locked)).toBe(true);
    const ring = screen.getByTestId('limit-ring');
    expect(ring).toHaveAttribute('data-locked', 'true');
    expect(ring.querySelector('svg.lucide-lock')).not.toBeNull();
    expect(ring.querySelector('pattern')).not.toBeNull();
    expect(ring).not.toHaveTextContent('%');
    expect(screen.getByText('This remaining amount cannot be used')).toBeInTheDocument();
    const band = screen.getByTestId('lock-band');
    expect(band).toHaveTextContent('Credit is locked');
    expect(band).toHaveTextContent(
      'Pay for each purchase before loading. Call your sales officer.',
    );
    expect(band).toHaveTextContent('The review date, 18 Nov, passed 6 days ago.');
    expect(container.querySelector('[data-lit="true"]')).toHaveTextContent('CASH & CARRY');
    // A locked report is not read as fine.
    expect(statusOf(locked)).toBe('attention');
  });
});

describe('credit_dod: figures, form, purchases and review', () => {
  it('shows limit, used and left as three tiles, exact amounts under More', () => {
    open(creditData());
    const figures = screen.getByTestId('limit-figures');
    expect(figures).toHaveTextContent('Limit');
    expect(figures).toHaveTextContent('₹60 L');
    expect(figures).toHaveTextContent('₹47.25 L');
    expect(figures).toHaveTextContent('₹12.75 L');
    const more = screen.getByTestId('more-row');
    expect(more).not.toHaveAttribute('open');
    expect(within(more).getByTestId('exact-limit')).toHaveTextContent('₹60,00,000');
    expect(within(more).getByTestId('exact-used')).toHaveTextContent('₹47,25,310');
    expect(within(more).getByTestId('exact-left')).toHaveTextContent('₹12,74,690');
    expect(within(more).getByText('Figures are up to 24 Nov, 3:16 pm.')).toBeInTheDocument();
    expect(
      within(more).getByText('Later purchases and payments are not in it.'),
    ).toBeInTheDocument();
  });

  it('lights one form of limit with a tick and a thick border, all three always drawn', () => {
    open(creditData());
    const chips = within(screen.getByTestId('form-chips')).getAllByRole('listitem');
    expect(
      chips.map((c) => [c.textContent?.replace('✓', '').trim(), c.getAttribute('data-lit')]),
    ).toEqual([
      ['DOD', 'true'],
      ['CREDIT', 'false'],
      ['CASH & CARRY', 'false'],
    ]);
    expect(chips[0]!.className).toContain('border-2');
    expect(chips[0]!.querySelector('svg.lucide-check')).not.toBeNull();
  });

  it('draws no chips when the form is not known', () => {
    open(creditData({ limit: { ...creditData().limit, form: null } }));
    expect(screen.queryByTestId('form-chips')).toBeNull();
  });

  it('lists open purchases with the date bought and the deadline', () => {
    open(
      creditData({
        lots: [
          { boughtOn: '2026-11-21', amount: 80000, deadline: '2026-11-27' },
          { boughtOn: '2026-11-22', amount: 44000, deadline: '2026-11-28' },
        ],
      }),
    );
    const rows = within(screen.getByTestId('open-purchases')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('₹80,000');
    expect(rows[0]).toHaveTextContent('Bought 21 Nov · deposit by 27 Nov');
  });

  it('prints a far review date as months with the date in brackets, and says nothing when unknown', () => {
    const { unmount } = open(creditData());
    expect(screen.getByTestId('review-line')).toHaveTextContent(
      'Credit review in about 4 months (31 Mar 2027)',
    );
    unmount();
    const near = open(creditData({ review: { on: '2026-12-10', daysUntil: 16, lapsed: false } }));
    expect(screen.getByTestId('review-line')).toHaveTextContent(
      'Credit review on 10 Dec 2026 (16 days)',
    );
    near.unmount();
    open(creditData({ review: null }));
    expect(screen.queryByTestId('review-line')).toBeNull();
  });
});

describe('credit_dod: back-dated and festival', () => {
  it('says first that it is an old position', () => {
    open(creditData({ backdated: true, asOf: '2026-11-20' }));
    expect(screen.getByTestId('backdated-banner')).toHaveTextContent(
      'Position as of 20 Nov, not today.',
    );
  });

  it('dresses the page with the festival greeting', () => {
    open(creditData({ festivalKey: 'diwali' }), 'en');
    expect(screen.getByTestId('festival-strip')).toHaveTextContent(/Diwali/i);
    expect(screen.getByTestId('festival-strip').style.background).toContain('gradient');
  });

  it('draws no strip without a festival', () => {
    open(creditData());
    expect(screen.queryByTestId('festival-strip')).toBeNull();
  });
});

describe('credit_dod: tile', () => {
  it('shows the amount with the date and days left, from the report', () => {
    expect(view.tile(creditData(), 'en')).toEqual({
      value: '₹1,24,000',
      sub: 'by 27 Nov · 3 days left',
      status: 'info',
    });
  });

  it('overdue is a problem with its days', () => {
    expect(view.tile(overdue, 'en')).toEqual({
      value: '₹2,30,000',
      sub: '6 days overdue',
      status: 'problem',
    });
  });

  it('inside the lag it is attention and says the payment may not be posted', () => {
    expect(view.tile(lag, 'en')).toEqual({
      value: '₹1,24,000',
      sub: 'Payment may not be posted',
      status: 'attention',
    });
  });

  it('advance and settled are fine', () => {
    expect(view.tile(advance, 'en')).toEqual({
      value: '₹29,670',
      sub: 'IndianOil holds it for you',
      status: 'ok',
    });
    expect(view.tile(settled, 'en')).toEqual({
      value: 'No dues',
      sub: 'Limit left ₹12.75 L',
      status: 'ok',
    });
  });

  it('adds the lock to the line and lifts a calm status to attention', () => {
    const t = view.tile(locked, 'en');
    expect(t?.sub).toBe('by 27 Nov · 3 days left · Credit locked');
    expect(t?.status).toBe('attention');
  });

  it('a back-dated report is shown as old and calm', () => {
    expect(view.tile(creditData({ backdated: true, asOf: '2026-11-20' }), 'en')).toEqual({
      value: '₹1,24,000',
      sub: 'As of 20 Nov',
      status: 'info',
    });
  });

  it('today is attention', () => {
    expect(statusOf(creditData({ verdict: 'due_today' }))).toBe('attention');
    expect(view.tile(creditData({ verdict: 'due_today' }), 'en')?.sub).toBe('Deposit today');
  });
});

describe('credit_dod: alert, headline and share', () => {
  it('overdue is a problem alert, and mentions a lock', () => {
    expect(view.alert(overdue, 'en')).toEqual({
      headline: '₹2,30,000 overdue',
      line: 'Deposit it with IndianOil now.',
      severity: 'problem',
    });
    expect(
      view.alert({ ...overdue, review: { on: '2026-11-18', daysUntil: -6, lapsed: true } }, 'en')
        ?.line,
    ).toContain('Credit is also locked.');
  });

  it('inside the lag it asks for a look, softly', () => {
    expect(view.alert(lag, 'en')).toEqual({
      headline: 'The deposit deadline passed',
      line: 'Your payment may not be posted yet.',
      severity: 'attention',
    });
  });

  it('a lock alone is an attention alert', () => {
    expect(view.alert(locked, 'en')).toEqual({
      headline: 'Credit is locked',
      line: 'Pay for each purchase before loading. Call your sales officer.',
      severity: 'attention',
    });
  });

  it('a normal deposit, an advance, a settled day and an old position raise nothing', () => {
    expect(view.alert(creditData(), 'en')).toBeNull();
    expect(view.alert(advance, 'en')).toBeNull();
    expect(view.alert(settled, 'en')).toBeNull();
    expect(view.alert({ ...overdue, backdated: true }, 'en')).toBeNull();
  });

  it('writes one plain line for each verdict', () => {
    expect(view.headline(creditData(), 'en')).toBe('₹1,24,000 to deposit by 27 Nov');
    expect(view.headline(creditData(), 'hl')).toBe('27 Nov tak ₹1,24,000 jama karein');
    expect(view.headline(creditData(), 'hi')).toBe('27 नवंबर तक ₹1,24,000 जमा करें');
    expect(view.headline(overdue, 'en')).toBe('₹2,30,000 overdue');
    expect(view.headline(lag, 'en')).toBe('₹1,24,000: deadline passed');
    expect(view.headline(advance, 'en')).toBe('IndianOil holds ₹29,670 for you');
    expect(view.headline(settled, 'en')).toBe('No dues');
    expect(view.headline(creditData({ verdict: 'due_today' }), 'en')).toBe(
      '₹1,24,000 to deposit today',
    );
  });

  it('shares a plain summary a bank or an officer can read', () => {
    expect(view.share(creditData(), 'en')).toBe(
      [
        'Credit & DOD',
        'Position as of 24 Nov, 3:16 pm',
        '₹1,24,000 to deposit by 27 Nov',
        'Limit: ₹60,00,000',
        'Used: ₹47,25,310.40 (79%)',
        'Left: ₹12,74,689.60',
        'Form of limit: DOD',
        'Credit review in about 4 months (31 Mar 2027)',
        'From the IndianOil portal, via MDG.',
      ].join('\n'),
    );
    expect(view.share(locked, 'en')).toContain(
      'Credit is locked. Pay for each purchase before loading. Call your sales officer.',
    );
  });

  it('draws a ring glyph', () => {
    const G = view.Glyph;
    const { container } = render(<G size={28} />);
    expect(container.querySelectorAll('svg circle')).toHaveLength(2);
    expect(view.kind).toBe('credit_dod');
  });
});

describe('credit_dod: days counted from the date, not frozen at the card', () => {
  // The 7 pm card of 24 Nov: the deposit is due tomorrow.
  const evening = () =>
    creditData({
      verdict: 'due_soon',
      money: { ...creditData().money, date: '2026-11-25', daysLeft: 1 },
    });

  it('the same card read on the morning of the last day says due today, in the hero, the tile, the headline and the share', () => {
    ON('2026-11-25T03:30:00.000Z'); // 9 am on 25 Nov in India
    const card = evening();
    open(card);
    expect(screen.getByTestId('credit-hero')).toHaveAttribute('data-verdict', 'due_today');
    expect(screen.queryByText('last day tomorrow')).toBeNull();
    expect(view.tile(card, 'en')?.sub).toBe('Deposit today');
    expect(view.tile(card, 'en')?.status).toBe('attention');
    expect(view.headline(card, 'en')).toBe('₹1,24,000 to deposit today');
    expect(view.share(card, 'en')).toContain('₹1,24,000 to deposit today');
  });

  it('read two days after the date it says overdue, with the real count and a problem alert', () => {
    ON('2026-11-27T03:30:00.000Z');
    const card = evening();
    expect(liveCredit(card).verdict).toBe('overdue');
    expect(liveCredit(card).money.daysLeft).toBe(-2);
    open(card);
    const hero = screen.getByTestId('credit-hero');
    expect(hero).toHaveAttribute('data-verdict', 'overdue');
    expect(within(hero).getByText('2 days overdue')).toBeInTheDocument();
    expect(view.tile(card, 'en')).toEqual({
      value: '₹1,24,000',
      sub: '2 days overdue',
      status: 'problem',
    });
    expect(view.alert(card, 'en')).toMatchObject({
      headline: '₹1,24,000 overdue',
      severity: 'problem',
    });
  });

  it('keeps counting an overdue card forward and keeps its "at least"', () => {
    ON('2026-11-28T03:30:00.000Z'); // overdue fixture: deadline 18 Nov
    expect(liveCredit(overdue).money.daysLeft).toBe(-10);
    open({ ...overdue, money: { ...overdue.money, daysIsMinimum: true } });
    expect(screen.getByText('At least 10 days overdue')).toBeInTheDocument();
  });

  it('keeps what a card was sent with when it has no date or is back-dated', () => {
    ON('2026-12-30T03:30:00.000Z');
    const noDate = creditData({ money: { ...creditData().money, date: null, daysLeft: 3 } });
    expect(liveCredit(noDate)).toBe(noDate);
    const old = creditData({ backdated: true });
    expect(liveCredit(old)).toBe(old);
    expect(liveCredit(advance)).toBe(advance);
    expect(liveCredit(settled)).toBe(settled);
  });

  it('leaves a verdict alone while the count has not crossed a line', () => {
    ON('2026-11-24T10:00:00.000Z');
    const card = creditData();
    expect(liveCredit(card).verdict).toBe('due');
    expect(liveCredit(card).money.daysLeft).toBe(3);
  });
});

describe('credit_dod: the kit parts', () => {
  it('puts the ring, the three figures and the form of limit in one card named "Credit limit"', () => {
    open(creditData());
    const card = screen.getByRole('region', { name: 'Credit limit' });
    expect(within(card).getByTestId('limit-ring')).toBeInTheDocument();
    expect(within(card).getByTestId('limit-figures')).toBeInTheDocument();
    expect(within(card).getByTestId('form-chips')).toBeInTheDocument();
  });

  it('draws each figure as a labelled tile that says its label and its amount', () => {
    open(creditData());
    const figures = screen.getByTestId('limit-figures');
    expect(within(figures).getByRole('group', { name: 'Limit: ₹60 L' })).toBeInTheDocument();
    expect(within(figures).getByRole('group', { name: 'Used: ₹47.25 L' })).toBeInTheDocument();
    expect(within(figures).getByRole('group', { name: 'Left: ₹12.75 L' })).toBeInTheDocument();
  });

  it('keeps the big numbers on the type scale, with no fixed pixel size', () => {
    const { container } = open(creditData());
    expect(screen.getByTestId('credit-amount').className).toContain('text-display');
    // A square no wider than the screen: 11 rem, but never past the card at 200% text.
    expect(screen.getByTestId('limit-ring').className).toContain('aspect-square');
    expect(screen.getByTestId('limit-ring').className).toContain('max-w-full');
    expect(container.innerHTML).not.toMatch(/text-\[\d|h-\[\d+px|w-\[\d+px|min-h-\[\d+px/);
  });

  it('lists open purchases in a card that counts them', () => {
    open(
      creditData({
        lots: [
          { boughtOn: '2026-11-21', amount: 80000, deadline: '2026-11-27' },
          { boughtOn: '2026-11-22', amount: 44000, deadline: '2026-11-28' },
        ],
      }),
    );
    const card = screen.getByRole('region', { name: /Open purchases/ });
    expect(within(card).getByRole('heading', { name: /Open purchases/ })).toHaveTextContent('2');
  });

  it('says "Credit limit" in Hindi', () => {
    open(creditData(), 'hi');
    expect(screen.getByRole('region', { name: 'क्रेडिट लिमिट' })).toBeInTheDocument();
  });
});
