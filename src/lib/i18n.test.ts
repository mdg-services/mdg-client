import { describe, expect, it } from 'vitest';

import { messages, pick, translate, type MessageKey } from './i18n';
import { hl } from './i18n.hl';

/**
 * Every string a dealer can see exists in Hindi as well as English. Hindi is the
 * language most dealers read the app in; a key with an empty Hindi side shows
 * them nothing at all.
 */
describe('i18n — every key in both languages', () => {
  it('no key has an empty English or Hindi side', () => {
    const missing = Object.entries(messages)
      .filter(([, m]) => !m.en.trim() || !m.hi.trim())
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it('the voice-note keys are all there', () => {
    const keys = [
      'chat.micStarting',
      'chat.slideToLock',
      'chat.micFailedTitle',
      'chat.micFailedHint',
      'chat.micTryAgain',
      'chat.micTypeInstead',
      'chat.micMutedTitle',
      'chat.micMutedHint',
      'chat.micMutedMid',
      'chat.micUpdateLaterTitle',
      'chat.micUpdateLaterHint',
      'chat.micUpdateTitle',
      'chat.micUpdateButton',
      'chat.micRefusedTitle',
      'chat.micRefusedHint',
      'chat.micAllow',
      'chat.micSettingsTitle',
      'chat.micSettingsHint',
      'chat.micExplainer',
      'chat.micExplainerOk',
      'chat.voiceReviewStopped',
      'chat.voiceSilent',
      'chat.voiceRecordAgain',
      'chat.voiceSendAnyway',
      'chat.voiceLost',
      'chat.micRefusedHintAndroid',
      'chat.micExplainerAndroid',
      'chat.micRestartTitle',
      'chat.micRestartHint',
      'chat.voiceStillSaving',
    ];
    for (const k of keys) expect(messages).toHaveProperty([k]);
  });

  it('"another app" is no longer said for a mic that simply failed to start', () => {
    expect(messages).not.toHaveProperty(['chat.micBusy']);
    const anotherApp = Object.entries(messages)
      .filter(([, m]) => /another app/i.test(m.en))
      .map(([k]) => k);
    expect(anotherApp).toEqual([]);
  });

  it('never calls a dealer "Sir"', () => {
    const sir = Object.entries(messages)
      .filter(([k]) => k.startsWith('chat.mic') || k.startsWith('chat.voice'))
      .filter(([, m]) => /\bsir\b|सर\b/i.test(`${m.en} ${m.hi}`))
      .map(([k]) => k);
    expect(sir).toEqual([]);
  });
});

describe('Hinglish (i18n.hl.ts)', () => {
  const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

  it('has every key, never empty, with the same {placeholders} as the English', () => {
    for (const key of Object.keys(messages) as MessageKey[]) {
      expect(hl[key]?.trim(), key).toBeTruthy();
      expect(holes(hl[key]), key).toEqual(holes(messages[key].en));
    }
  });

  it('is written in English letters: no Devanagari', () => {
    const deva = Object.entries(hl).filter(([, v]) => /[ऀ-ॿ]/.test(v));
    expect(deva).toEqual([]);
  });

  it('is what t() gives a Hinglish reader', () => {
    expect(translate('hl', 'common.retry')).toBe(hl['common.retry']);
    expect(translate('hl', 'common.retry')).not.toBe(messages['common.retry'].en);
  });

  it('reads the English of a two-language data label', () => {
    expect(pick('hl', 'Indian Oil', 'इंडियन ऑयल')).toBe('Indian Oil');
    expect(pick('hi', 'Indian Oil', 'इंडियन ऑयल')).toBe('इंडियन ऑयल');
  });
});
