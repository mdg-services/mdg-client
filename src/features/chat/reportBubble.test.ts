import { afterEach, describe, expect, it } from 'vitest';

import { resetEmbeddedForTests } from '@/lib/embedMode';
import { messages } from '@/lib/i18n';
import { hl } from '@/lib/i18n.hl';
import { makeMessage } from '@/test/utils';
import { REPORT_KINDS, type Attachment } from '@dk/shared/types';

import {
  REPORT_SENTENCE_KEY,
  chatAttachments,
  cleanReportCaption,
  isLegacyReportCaption,
  isReportBubble,
  reportKindOf,
  reportRowOf,
} from './reportBubble';

const file = (filename: string, over: Partial<Attachment> = {}): Attachment => ({
  storageKey: `k/${filename}`,
  filename,
  contentType: 'image/png',
  size: 10,
  kind: 'image',
  url: `https://files.test/${filename}`,
  ...over,
});

const fromMdg = (over: Parameters<typeof makeMessage>[0] = {}) =>
  makeMessage({ senderId: 'mdg', senderRole: 'admin', system: true, ...over });

describe('cleanReportCaption — old captions, the way the team would have written them', () => {
  it('takes a leading emoji off the first line', () => {
    expect(cleanReportCaption('📊 Aaj ki DSR bhej di hai')).toBe('Aaj ki DSR bhej di hai');
    expect(cleanReportCaption('💧 Tank mein paani ki jaanch: 3 mein se 3')).toBe(
      'Tank mein paani ki jaanch: 3 mein se 3',
    );
  });

  it('takes several marks, joiners and variation selectors off, however the emoji is built', () => {
    expect(cleanReportCaption('⚠️ Credit locked')).toBe('Credit locked');
    expect(cleanReportCaption('👨‍👩‍👧 hello')).toBe('hello');
    expect(cleanReportCaption('🇮🇳 Jai hind')).toBe('Jai hind');
    expect(cleanReportCaption('✅📒 Do entries')).toBe('Do entries');
  });

  it('turns the "label ·" prefix into plain words, the same in every language and for a heading of any length', () => {
    expect(cleanReportCaption('DSR · 13 Aug — stock variation within limit')).toBe(
      'DSR, 13 Aug — stock variation within limit',
    );
    expect(cleanReportCaption('📊 DSR · 13 Aug — stock variation within limit')).toBe(
      'DSR, 13 Aug — stock variation within limit',
    );
    expect(cleanReportCaption('कवच · हमें आपसे ये चाहिए')).toBe('कवच, हमें आपसे ये चाहिए');
    expect(cleanReportCaption('Credit & DOD · koi baaki nahi')).toBe('Credit & DOD, koi baaki nahi');
  });

  it('keeps the words that name the report: the real captions in English, Hindi and Hinglish', () => {
    // From the 30-day read behind the ADR (reportKind.test.ts). The heading is the only
    // thing that says what the message is, so it must survive, in every language.
    expect(cleanReportCaption('📊 DSR · 12 Nov — daily sales.')).toBe('DSR, 12 Nov — daily sales.');
    expect(cleanReportCaption('💧 Water ingress testing · 12 Nov — 3 of 3 windows recorded.')).toBe(
      'Water ingress testing, 12 Nov — 3 of 3 windows recorded.',
    );
    expect(cleanReportCaption('🛡️ Kavach · 12 Nov — 12/14 points (86%).')).toBe(
      'Kavach, 12 Nov — 12/14 points (86%).',
    );
    expect(cleanReportCaption('♻️ Revised DSR · 12 Nov — use this one, not the earlier copy.')).toBe(
      'Revised DSR, 12 Nov — use this one, not the earlier copy.',
    );
    // A Hindi heading of four words and a Hinglish one of five went untouched by the old
    // three-word limit, so a Hindi dealer still read the "label · date" style.
    expect(cleanReportCaption('💧 टैंक में पानी की जाँच · 12 नवंबर — 3 में से 3 पारियाँ दर्ज।')).toBe(
      'टैंक में पानी की जाँच, 12 नवंबर — 3 में से 3 पारियाँ दर्ज।',
    );
    expect(cleanReportCaption('💧 Tank mein paani ki jaanch · 12 Nov — 3 mein se 3 slot darj.')).toBe(
      'Tank mein paani ki jaanch, 12 Nov — 3 mein se 3 slot darj.',
    );
  });

  it('strips an emoji that starts a later line too, and leaves the figures and the words alone', () => {
    expect(cleanReportCaption('📊 DSR · 13 Aug\n⛽ Petrol 4,200 L\n⛽ Diesel 6,100 L')).toBe(
      'DSR, 13 Aug\nPetrol 4,200 L\nDiesel 6,100 L',
    );
  });

  it('leaves a caption without any of them exactly as it came', () => {
    const plain = 'Aaj ki DSR bhej di hai. Petrol 4,200 L, Diesel 6,100 L.';
    expect(cleanReportCaption(plain)).toBe(plain);
    expect(cleanReportCaption('Your declaration has been filed.')).toBe(
      'Your declaration has been filed.',
    );
  });

  it('does not take a middle dot with a figure before it: that is a fact, not a heading', () => {
    expect(cleanReportCaption('5 KL · tanker aa gaya')).toBe('5 KL · tanker aa gaya');
  });

  it('does not take a dot in the middle of a line, and keeps digits that start a line', () => {
    expect(cleanReportCaption('Diesel 6,100 L · Petrol 4,200 L')).toBe('Diesel 6,100 L · Petrol 4,200 L');
    expect(cleanReportCaption('13 Aug ko 4,200 L bika')).toBe('13 Aug ko 4,200 L bika');
  });

  it('gives back an empty string when nothing but a mark was there', () => {
    expect(cleanReportCaption('📊')).toBe('');
    expect(cleanReportCaption('   ')).toBe('');
  });
});

describe('isReportBubble', () => {
  it('is true for a tagged message, with or without a picture', () => {
    expect(
      isReportBubble(
        fromMdg({ body: 'x', attachments: [file('card.png')], report: { kind: 'dsr_sales', status: 'ok' } }),
      ),
    ).toBe(true);
    expect(
      isReportBubble(fromMdg({ body: 'x', attachments: [], report: { kind: 'credit_dod', status: 'attention' } })),
    ).toBe(true);
  });

  it('is true for an older card recognised by its file name', () => {
    expect(
      isReportBubble(
        fromMdg({ body: 'DSR · 13 Aug', attachments: [file('dsr-variation-2026-08-13.png')] }),
      ),
    ).toBe(true);
  });

  it('is false for an ordinary message, and for an admin picture that is not a card', () => {
    expect(isReportBubble(makeMessage({ body: 'hello' }))).toBe(false);
    expect(isReportBubble(fromMdg({ body: 'look at this', attachments: [file('site-visit.png')] }))).toBe(false);
  });

  it('is false for every interactive box, even when it carries a report tag', () => {
    const tag = { kind: 'dsr_sales' as const, status: 'ok' as const };
    for (const box of [
      { ask: { ref: 'doc:1', kind: 'document', title: 'Fire NOC' } },
      { portalLogin: { portals: ['sdms'] } },
      { wemmisLogin: {} },
      { setupCard: { card: { kind: 'welcome' } } },
      { duOtpAck: {} },
      { mockDrill: {} },
      { declarations: {} },
      { outletDetails: {} },
      { videoList: {} },
      { complaint: { complaintId: 'c1' } },
      { workPermit: { permitId: 'p1' } },
    ]) {
      expect(isReportBubble(fromMdg({ body: 'x', report: tag, attachments: [file('dsr-sales-2026-11-22.png')], ...box } as never))).toBe(false);
    }
  });

  it('is false for a dealer message still being sent', () => {
    expect(
      isReportBubble(
        makeMessage({ id: 'temp-1', report: { kind: 'dsr_sales', status: 'ok' }, body: 'x' }),
      ),
    ).toBe(false);
  });
});

describe('chatAttachments', () => {
  const card = file('dsr-sales-2026-11-22.png');

  it('is every attachment on an ordinary message, the same array', () => {
    const m = makeMessage({ attachments: [file('a.png'), file('b.png')] });
    expect(chatAttachments(m)).toBe(m.attachments);
  });

  it('takes the card pictures off a report and keeps nothing for a plain one', () => {
    const m = fromMdg({ body: 'x', attachments: [card, file('dsr-variation-2026-11-22.png')] });
    expect(chatAttachments(m)).toEqual([]);
  });

  it('keeps a voice note or a video a report message also carries', () => {
    const voice = file('note.webm', { kind: 'audio', contentType: 'audio/webm' });
    const clip = file('clip.mp4', { kind: 'file', contentType: 'video/mp4' });
    const m = fromMdg({
      body: 'x',
      report: { kind: 'dsr_sales', status: 'ok' },
      attachments: [card, voice, clip],
    });
    expect(chatAttachments(m)).toEqual([voice, clip]);
  });

  it('keeps every attachment of an interactive box: a letter to sign, an ask\'s file', () => {
    const letter = file('letter.pdf', { kind: 'file', contentType: 'application/pdf' });
    const m = fromMdg({
      body: 'Please sign',
      attachments: [letter],
      ask: { ref: 'doc:1', kind: 'document', title: 'Sign the letter' },
    } as never);
    expect(chatAttachments(m)).toEqual([letter]);
  });
});

describe('reportKindOf and the empty-body sentences', () => {
  it('names the kind of a report bubble and nothing for any other message', () => {
    expect(reportKindOf(fromMdg({ report: { kind: 'tt_ack', status: 'ok' } }))).toBe('tt_ack');
    expect(reportKindOf(makeMessage({ body: 'hi' }))).toBeNull();
  });

  it('has a sentence for every kind, in all three languages, with no emoji and no "·" label', () => {
    expect(Object.keys(REPORT_SENTENCE_KEY).sort()).toEqual([...REPORT_KINDS].sort());
    for (const kind of REPORT_KINDS) {
      const key = REPORT_SENTENCE_KEY[kind];
      const en = messages[key].en;
      const hi = messages[key].hi;
      const latin = hl[key];
      for (const text of [en, hi, latin]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(cleanReportCaption(text)).toBe(text);
        expect(text).not.toMatch(/\bSir\b|\bsir\b|MDG team|MDG टीम/);
      }
      expect(/[ऀ-ॿ]/.test(hi)).toBe(true);
      expect(/[ऀ-ॿ]/.test(latin)).toBe(false);
    }
  });
});

describe('inside the extension\'s side panel', () => {
  afterEach(() => {
    window.sessionStorage.removeItem('dk.embed');
    resetEmbeddedForTests();
  });

  it('is the same words-and-button bubble: no picture, the report named by its button (ADR 0056)', () => {
    const m = fromMdg({
      body: 'Aaj ki DSR bhej di hai.',
      attachments: [file('dsr-sales-2026-11-22.png')],
      report: { kind: 'dsr_sales', status: 'ok' },
    });
    expect(isReportBubble(m)).toBe(true);
    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
    // The panel has no Today, but its button opens the overlay inside the thread.
    expect(isReportBubble(m)).toBe(true);
    expect(chatAttachments(m)).toHaveLength(0);
    expect(reportKindOf(m)).toBe('dsr_sales');
  });
});

describe('reportRowOf — the overlay\'s first frame from the message itself', () => {
  it('carries the tag, the snapshot, the day, the pictures and the ids', () => {
    const data = { kind: 'dsr_sales' as const, v: 1 as const, products: [] };
    const card = file('dsr-sales-2026-11-22.png');
    const m = fromMdg({
      id: 'm9',
      body: 'Aaj ki DSR bhej di hai.',
      attachments: [card],
      report: { kind: 'dsr_sales', status: 'ok', day: '2026-11-22', data } as never,
    });
    expect(reportRowOf(m, 'Aaj ki DSR bhej di hai.')).toMatchObject({
      id: 'm9',
      kind: 'dsr_sales',
      status: 'ok',
      day: '2026-11-22',
      headline: 'Aaj ki DSR bhej di hai.',
      messageId: 'm9',
      conversationId: m.conversationId,
      data,
      attachments: [card],
    });
  });

  it('drops a snapshot that is not this app\'s version or not this kind: the words and picture still open', () => {
    const wrongVersion = fromMdg({ report: { kind: 'dsr_sales', status: 'ok', data: { kind: 'dsr_sales', v: 2 } } as never });
    expect(reportRowOf(wrongVersion, 'x')?.data).toBeUndefined();
    const wrongKind = fromMdg({ report: { kind: 'dsr_sales', status: 'ok', data: { kind: 'credit_dod', v: 1 } } as never });
    expect(reportRowOf(wrongKind, 'x')?.data).toBeUndefined();
  });

  it('recognises an old picture-only message and gives it no snapshot', () => {
    const m = fromMdg({
      body: '📊 DSR · 13 Aug — stock variation within limit',
      attachments: [file('dsr-variation-2026-08-13.png')],
    });
    const row = reportRowOf(m, 'DSR, 13 Aug');
    expect(row?.kind).toBe('dsr_variation');
    expect(row?.data).toBeUndefined();
    expect(row?.attachments).toHaveLength(1);
  });

  it('is null for anything that is not a report bubble: a dealer\'s message, an interactive box, a message still being sent', () => {
    expect(reportRowOf(fromMdg({ body: 'hello' }), 'hello')).toBeNull();
    expect(reportRowOf(fromMdg({ id: 'temp-1', report: { kind: 'dsr_sales', status: 'ok' } }), 'x')).toBeNull();
  });
});

describe('REPORT_SENTENCE_KEY', () => {
  it('has a sentence for every one of the nineteen kinds, including the three ADR 0056 added', () => {
    expect(Object.keys(REPORT_SENTENCE_KEY).sort()).toEqual([...REPORT_KINDS].sort());
    expect(REPORT_SENTENCE_KEY.electrical_audit).toBe('chat.reportSentenceElectricalAudit');
    expect(REPORT_SENTENCE_KEY.calibration_claim).toBe('chat.reportSentenceCalibrationClaim');
    expect(REPORT_SENTENCE_KEY.paper_expiry).toBe('chat.reportSentencePaperExpiry');
  });
});

describe('isLegacyReportCaption', () => {
  it('is true only for an old caption: not a tagged message, an announcement or a tanker card', () => {
    expect(isLegacyReportCaption(fromMdg({ body: '📊 DSR · 13 Aug', attachments: [file('dsr-sales-2026-08-13.png')] }))).toBe(true);
    expect(isLegacyReportCaption(fromMdg({ body: 'x', report: { kind: 'dsr_sales', status: 'ok' } }))).toBe(false);
    expect(isLegacyReportCaption(fromMdg({ body: 'x', announcement: { title: 'Holiday', tone: 'notice' } } as never))).toBe(false);
    expect(isLegacyReportCaption(fromMdg({ body: 'x', fuelCard: { kind: 'tanker_assigned' } } as never))).toBe(false);
  });
});
