import { describe, expect, it } from 'vitest';

import { messages, translate, type MessageKey } from '@/lib/i18n';
import { makeAutopay } from '@/test/payments';
import { AUTOPAY_STOP_REASONS, AUTOPAY_VIEW_STATES } from '@dk/shared/types';

import {
  ALREADY_OFF_MARGIN_MS,
  AUTOPAY_STATE_KEY,
  AUTOPAY_TONE,
  STOP_REASONS,
  STOP_REASON_KEY,
  autopayBody,
  autopaySubtitle,
  canStop,
  dialogBody,
  dialogTitleKey,
  helpLineKey,
  inProgressLine,
  keepLabelKey,
  offBody,
  showAskInChat,
  stopBody,
  stopLabelKey,
  toggleReason,
  wasAlreadyOff,
} from './autopayView';

const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const hi = (key: MessageKey, vars?: Record<string, string | number>) => translate('hi', key, vars);

describe('the chip', () => {
  it('has a word and a colour for every state the server can send', () => {
    for (const state of AUTOPAY_VIEW_STATES) {
      expect(AUTOPAY_STATE_KEY[state]).toBeDefined();
      expect(AUTOPAY_TONE[state]).toBeDefined();
    }
  });

  it('says Waiting, On, Needs attention and Off — and the same in Hindi', () => {
    expect(AUTOPAY_VIEW_STATES.map((s) => en(AUTOPAY_STATE_KEY[s]))).toEqual([
      'Waiting',
      'On',
      'Needs attention',
      'Off',
    ]);
    expect(AUTOPAY_VIEW_STATES.map((s) => hi(AUTOPAY_STATE_KEY[s]))).toEqual([
      'इंतज़ार',
      'चालू',
      'ध्यान दें',
      'बंद',
    ]);
  });

  // Amber for "waiting on someone" and "a debit bounced", green for on, grey for off.
  // Never red: nothing here is an error of the dealer's.
  it('wears amber, green, amber and grey, and never red', () => {
    expect(AUTOPAY_VIEW_STATES.map((s) => AUTOPAY_TONE[s])).toEqual([
      'warning',
      'success',
      'warning',
      'neutral',
    ]);
  });
});

describe('autopaySubtitle (the Help row and the Payments card)', () => {
  it('waiting: says it is waiting for the approval', () => {
    const a = makeAutopay({ state: 'setting_up', nextDebitOn: null });
    expect(autopaySubtitle(en, 'en', a)).toBe('Waiting for your approval');
    expect(autopaySubtitle(hi, 'hi', a)).toBe('आपकी मंज़ूरी का इंतज़ार');
  });

  it('on: the monthly amount and the next day, both from the server', () => {
    const a = makeAutopay({ state: 'on', amountPaise: 354000, nextDebitOn: '2026-11-24' });
    expect(autopaySubtitle(en, 'en', a)).toBe('₹3,540 a month · next 24 Nov');
    expect(autopaySubtitle(hi, 'hi', a)).toMatch(/^₹3,540 हर महीने · अगली 24 नव/);
  });

  it('on with no day known yet: the amount alone, never a made-up day', () => {
    const a = makeAutopay({ state: 'on', nextDebitOn: null });
    expect(autopaySubtitle(en, 'en', a)).toBe('₹3,540 a month');
  });

  it('failing: says the last payment did not go through', () => {
    const a = makeAutopay({ state: 'failing' });
    expect(autopaySubtitle(en, 'en', a)).toBe('Last payment did not go through');
    expect(autopaySubtitle(hi, 'hi', a)).toBe('पिछला भुगतान नहीं हुआ');
  });

  it('off: says it works till the paid day', () => {
    const a = makeAutopay({ state: 'off', nextDebitOn: null, paidThrough: '2026-11-24' });
    expect(autopaySubtitle(en, 'en', a)).toBe('Off · works till 24 Nov');
    expect(autopaySubtitle(hi, 'hi', a)).toMatch(/^बंद · 24 नव.* तक चलेगा$/);
  });

  it('off with no paid day: just Off', () => {
    const a = makeAutopay({ state: 'off', nextDebitOn: null, paidThrough: null });
    expect(autopaySubtitle(en, 'en', a)).toBe('Off');
  });

  it('follows the amount the server sends, not a built-in 3,540', () => {
    const a = makeAutopay({ state: 'on', amountPaise: 118000, nextDebitOn: '2026-12-02' });
    expect(autopaySubtitle(en, 'en', a)).toBe('₹1,180 a month · next 2 Dec');
  });
});

describe('autopayBody (the card on the Autopay screen)', () => {
  it('on: where it is taken from, the next day, and the two ways to be warned or stop', () => {
    const a = makeAutopay({ state: 'on', nextDebitOn: '2026-11-24' });
    expect(autopayBody(en, 'en', a)).toBe(
      'Taken from your UPI account every month. Next: 24 Nov. Your UPI app warns you a day before. You can also stop it in your UPI app.',
    );
    expect(autopayBody(hi, 'hi', a)).toMatch(
      /^हर महीने आपके UPI खाते से कटेंगे। अगली तारीख: 24 नव.*। UPI ऐप एक दिन पहले बता देगा। आप इसे UPI ऐप में भी बंद कर सकते हैं।$/,
    );
  });

  it('on with no day known: the same words without the day', () => {
    const a = makeAutopay({ state: 'on', nextDebitOn: null });
    expect(autopayBody(en, 'en', a)).toBe(
      'Taken from your UPI account every month. Your UPI app warns you a day before. You can also stop it in your UPI app.',
    );
  });

  it('waiting: nothing has been taken, and no word on where the approval is', () => {
    const a = makeAutopay({ state: 'setting_up' });
    expect(autopayBody(en, 'en', a)).toBe('Waiting for your approval. Nothing has been taken.');
    expect(autopayBody(hi, 'hi', a)).toBe('आपकी मंज़ूरी का इंतज़ार है। अभी कुछ नहीं कटा।');
  });

  it('failing: names the amount that did not go through and says what to check', () => {
    const a = makeAutopay({ state: 'failing' });
    expect(autopayBody(en, 'en', a)).toBe(
      'The last ₹3,540 debit did not go through. Check the balance in your UPI account.',
    );
    expect(autopayBody(hi, 'hi', a)).toBe('पिछले ₹3,540 नहीं कट पाए। अपने UPI खाते की रकम जाँचिए।');
  });

  it('off: there is no card, the Off screen speaks instead', () => {
    expect(autopayBody(en, 'en', makeAutopay({ state: 'off' }))).toBeNull();
  });
});

describe('the one button', () => {
  it('shows in waiting, on and failing, and is gone when off', () => {
    expect(AUTOPAY_VIEW_STATES.filter(canStop)).toEqual(['setting_up', 'on', 'failing']);
  });

  it('reads Cancel setup while waiting, and Stop autopay otherwise', () => {
    expect(en(stopLabelKey('setting_up'))).toBe('Cancel setup');
    expect(hi(stopLabelKey('setting_up'))).toBe('सेटअप रद्द करें');
    for (const state of ['on', 'failing'] as const) {
      expect(en(stopLabelKey(state))).toBe('Stop autopay');
      expect(hi(stopLabelKey(state))).toBe('ऑटोपे बंद करें');
    }
  });

  it('adds Ask in chat on the screen only where the dealer is stuck: failing', () => {
    expect(AUTOPAY_VIEW_STATES.filter(showAskInChat)).toEqual(['failing']);
  });
});

describe('the dialog', () => {
  it('is titled Stop autopay?, or Cancel autopay setup? while waiting', () => {
    expect(en(dialogTitleKey('on'))).toBe('Stop autopay?');
    expect(hi(dialogTitleKey('on'))).toBe('ऑटोपे बंद करें?');
    expect(en(dialogTitleKey('failing'))).toBe('Stop autopay?');
    expect(en(dialogTitleKey('setting_up'))).toBe('Cancel autopay setup?');
  });

  it('keeps with a named button, never a bare Cancel', () => {
    expect(en(keepLabelKey('on'))).toBe('Keep autopay');
    expect(hi(keepLabelKey('on'))).toBe('ऑटोपे चालू रखें');
    expect(en(keepLabelKey('setting_up'))).toBe('Keep setup');
    for (const state of AUTOPAY_VIEW_STATES) {
      expect(en(keepLabelKey(state))).not.toMatch(/^cancel$/i);
      expect(hi(keepLabelKey(state))).not.toMatch(/^रद्द करें$/);
    }
  });

  it('says money stops and the service runs on to the paid day', () => {
    const a = makeAutopay({ paidThrough: '2026-11-24' });
    expect(dialogBody(en, 'en', a)).toBe(
      'No money will be taken automatically after this. Dealer Kavach keeps working till 24 Nov. After that you get a bill each month.',
    );
    expect(dialogBody(hi, 'hi', a)).toMatch(
      /^इसके बाद पैसे अपने-आप नहीं कटेंगे। डीलर कवच 24 नव.* तक चलता रहेगा। उसके बाद हर महीने का बिल आएगा।$/,
    );
  });

  it('does not invent a day when the server has none', () => {
    const a = makeAutopay({ paidThrough: null });
    expect(dialogBody(en, 'en', a)).not.toContain('paid month');
  });

  // A first-month setup: nothing is paid, so the service is not "running on a paid month".
  it('says nothing has been taken and the first bill is still to be paid when no month is paid', () => {
    const a = makeAutopay({ state: 'setting_up', paidThrough: null });
    expect(dialogBody(en, 'en', a)).toBe(
      'No money will be taken automatically after this. Nothing has been taken so far. Your first bill is still to be paid.',
    );
    expect(dialogBody(hi, 'hi', a)).toBe(
      'इसके बाद पैसे अपने-आप नहीं कटेंगे। अभी तक कुछ नहीं कटा है। आपका पहला बिल अभी चुकाना बाकी है।',
    );
    expect(dialogBody(en, 'en', a)).not.toMatch(/keeps working/);
  });

  it('opens with the in-flight warning only while a debit is being taken', () => {
    expect(inProgressLine(en, makeAutopay({ debitInProgress: false }))).toBeNull();
    const a = makeAutopay({ debitInProgress: true });
    expect(inProgressLine(en, a)).toBe('₹3,540 is being taken right now. Stopping will not undo it.');
    expect(inProgressLine(hi, a)).toBe('अभी ₹3,540 कट रहे हैं। बंद करने से यह वापस नहीं होगा।');
  });

  it('has one help line, and promises the first month back only inside it', () => {
    expect(en(helpLineKey({ firstMonthRefundable: false }))).toBe(
      'Something not right? Ask in chat.',
    );
    expect(hi(helpLineKey({ firstMonthRefundable: false }))).toBe('कुछ ठीक नहीं? चैट में पूछिए।');
    expect(en(helpLineKey({ firstMonthRefundable: true }))).toBe(
      'Not happy with the first month? We refund it in full. Ask in chat.',
    );
    expect(hi(helpLineKey({ firstMonthRefundable: true }))).toBe(
      'पहला महीना पसंद नहीं आया? पूरा पैसा वापस होगा। चैट में पूछिए।',
    );
  });
});

describe('the reasons', () => {
  it('are the five the server knows, in order, each with words in both languages', () => {
    expect([...STOP_REASONS]).toEqual([...AUTOPAY_STOP_REASONS]);
    expect(STOP_REASONS.map((r) => en(STOP_REASON_KEY[r]))).toEqual([
      "I'll pay myself each month",
      'Price is too much',
      'Not useful / something is wrong',
      'Closing or selling the pump',
      'Something else',
    ]);
    expect(STOP_REASONS.map((r) => hi(STOP_REASON_KEY[r]))).toEqual([
      'हर महीने खुद भरूँगा',
      'दाम ज़्यादा है',
      'काम का नहीं / कुछ गड़बड़ है',
      'पंप बंद या बेच रहा हूँ',
      'कुछ और',
    ]);
  });

  it('pick one at a time, and a second tap on the picked one clears it', () => {
    expect(toggleReason(null, 'closing')).toBe('closing');
    expect(toggleReason('closing', 'other')).toBe('other');
    expect(toggleReason('other', 'other')).toBeNull();
  });

  it('go in the request when one is picked, and never block it when none is', () => {
    expect(stopBody('too_expensive')).toEqual({ reason: 'too_expensive' });
    expect(stopBody(null)).toEqual({});
  });
});

describe('offBody (the Off screen)', () => {
  it('says the service works till the paid day and nothing is taken', () => {
    const a = makeAutopay({ state: 'off', paidThrough: '2026-11-24' });
    expect(offBody(en, 'en', a)).toBe(
      'Dealer Kavach works till 24 Nov. Nothing will be taken automatically.',
    );
    expect(offBody(hi, 'hi', a)).toMatch(
      /^डीलर कवच 24 नव.* तक चलेगा। पैसे अपने-आप नहीं कटेंगे।$/,
    );
  });

  it('says only that nothing will be taken when there is no paid day', () => {
    const a = makeAutopay({ state: 'off', paidThrough: null });
    expect(offBody(en, 'en', a)).toBe('Nothing will be taken automatically.');
  });
});

describe('wasAlreadyOff', () => {
  const sentAt = Date.parse('2026-10-25T10:00:00.000Z');

  it('is false for a stop made by this request', () => {
    const a = makeAutopay({ state: 'off', stoppedAt: '2026-10-25T10:00:01.000Z' });
    expect(wasAlreadyOff(a, sentAt)).toBe(false);
  });

  it('is false for a stop a hair before the request left, as a drifting clock can give', () => {
    const a = makeAutopay({
      state: 'off',
      stoppedAt: new Date(sentAt - ALREADY_OFF_MARGIN_MS + 5_000).toISOString(),
    });
    expect(wasAlreadyOff(a, sentAt)).toBe(false);
  });

  it('is true for one stopped well before: from the UPI app, or the other phone', () => {
    const a = makeAutopay({ state: 'off', stoppedAt: '2026-10-24T08:30:00.000Z' });
    expect(wasAlreadyOff(a, sentAt)).toBe(true);
  });

  it('is false with nothing to go on: no time, an unreadable time, or no autopay', () => {
    expect(wasAlreadyOff(makeAutopay({ state: 'off', stoppedAt: null }), sentAt)).toBe(false);
    expect(wasAlreadyOff(makeAutopay({ state: 'off', stoppedAt: 'sometime' }), sentAt)).toBe(false);
    expect(wasAlreadyOff(null, sentAt)).toBe(false);
  });
});

describe('the catalogue', () => {
  const keys = (Object.keys(messages) as MessageKey[]).filter((k) => k.startsWith('autopay.'));

  it('has every autopay string in English and in Hindi', () => {
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      expect(messages[key].en.trim(), `${key} (en)`).not.toBe('');
      expect(messages[key].hi.trim(), `${key} (hi)`).not.toBe('');
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of keys) {
      expect(holes(messages[key].hi), key).toEqual(holes(messages[key].en));
    }
  });

  // Google Play forbids a payment link or button in the app. Inside it autopay is
  // shown and stopped, so no sentence may point at a place, or tell anyone how to
  // turn it on.
  it('has no sentence that says where or how to turn autopay on', () => {
    const steering =
      /website|web site|browser|link|razorpay|visit|turn (it )?on|switch (it )?on|set (it )?up|start autopay|activate|enable|approve|वेबसाइट|ब्राउज़र|लिंक|चालू करें|चालू कीजिए|शुरू करें/i;
    for (const key of keys) {
      expect(messages[key].en, `${key} (en)`).not.toMatch(steering);
      expect(messages[key].hi, `${key} (hi)`).not.toMatch(steering);
    }
  });

  // India's dark-patterns rules: the way to stop may not be guilted or hidden.
  it('has no guilt in the words around the stop', () => {
    const guilt = /sure|regret|sorry|miss out|lose|don.t go|are you certain|सच में|पक्का/i;
    for (const key of keys) {
      expect(messages[key].en, `${key} (en)`).not.toMatch(guilt);
      expect(messages[key].hi, `${key} (hi)`).not.toMatch(guilt);
    }
  });
});
