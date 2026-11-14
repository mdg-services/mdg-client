import { describe, expect, it } from 'vitest';

import {
  makeAnswer,
  makeOutletDetailsView,
  makeQuestion,
  makeStateQuestion,
  saved,
} from '@/test/outletDetailsFixtures';

import {
  answerText,
  canonical,
  changedAnswers,
  formatDay,
  hasAnyAnswer,
  optionLabel,
  orderedOptions,
  pickWords,
  showsSuggestion,
  startingValue,
} from './outletDetailsView';

const WORDS = { yes: 'Yes', no: 'No' };

describe('words and options', () => {
  it('picks the reader\'s language and falls back to the other rather than to nothing', () => {
    expect(pickWords({ hi: 'नमस्ते', en: 'Hello' }, 'hi')).toBe('नमस्ते');
    expect(pickWords({ hi: 'नमस्ते', en: 'Hello' }, 'en')).toBe('Hello');
    expect(pickWords({ hi: '', en: 'Hello' }, 'hi')).toBe('Hello');
    expect(pickWords(undefined, 'hi')).toBe('');
  });

  it('writes a state as "हरियाणा (Haryana)" in Hindi and "Haryana" in English', () => {
    const haryana = { value: '06', label: { hi: 'हरियाणा', en: 'Haryana' } };
    expect(optionLabel('state', haryana, 'hi')).toBe('हरियाणा (Haryana)');
    expect(optionLabel('state', haryana, 'en')).toBe('Haryana');
    // A choice is not a state: it is the server's words, as they are.
    expect(optionLabel('choice', { value: 'a', label: { hi: 'हाँ जी', en: 'Yes' } }, 'hi')).toBe('हाँ जी');
  });

  it('sorts states in the reader\'s alphabet and keeps a choice in the server\'s order', () => {
    const state = makeStateQuestion();
    expect(orderedOptions(state, 'en').map((o) => o.label)).toEqual([
      'Bihar',
      'Delhi',
      'Haryana',
      'Maharashtra',
    ]);
    expect(orderedOptions(state, 'hi').map((o) => o.value)).toEqual(['07', '10', '27', '06']);
    const choice = makeQuestion('c', 'choice', {
      options: [
        { value: 'z', label: { hi: 'ज़', en: 'Zed' } },
        { value: 'a', label: { hi: 'अ', en: 'Aye' } },
      ],
    });
    expect(orderedOptions(choice, 'en').map((o) => o.value)).toEqual(['z', 'a']);
  });
});

describe('comparing a control with what is saved', () => {
  it('reads a number box as a number and an empty box as no answer', () => {
    expect(canonical('number', '12')).toBe(12);
    expect(canonical('number', ' 3,5 ')).toBe(3.5);
    expect(canonical('number', '')).toBeNull();
    expect(canonical('number', 'abc')).toBeNull();
    expect(canonical('text', '  hello  ')).toBe('hello');
    expect(canonical('text', '   ')).toBeNull();
    expect(canonical('yesno', false)).toBe(false);
    expect(canonical('yesno', 'x')).toBeNull();
  });

  it('starts from the saved answer, else the suggestion, and says when it is only a suggestion', () => {
    const open = makeStateQuestion({ answer: makeAnswer({ suggested: '06' }) });
    expect(startingValue(open)).toBe('06');
    expect(showsSuggestion(open, '06')).toBe(true);
    expect(showsSuggestion(open, '10')).toBe(false);
    const answered = makeStateQuestion({ answer: { ...saved('10'), suggested: '06' } });
    expect(startingValue(answered)).toBe('10');
    expect(showsSuggestion(answered, '10')).toBe(false);
  });
});

describe('changedAnswers', () => {
  const view = makeOutletDetailsView({
    questions: [
      makeStateQuestion({ answer: saved('06') }),
      makeQuestion('note', 'text', { answer: saved('old') }),
      makeQuestion('tanks', 'number'),
      makeQuestion('open_late', 'yesno', { answer: saved(false) }),
    ],
  });

  it('is null when nothing was touched', () => {
    expect(changedAnswers(view, {})).toBeNull();
  });

  it('is null when a box is put back to what was saved', () => {
    expect(changedAnswers(view, { note: 'old ', pump_state: '06' })).toBeNull();
  });

  it('carries only the answers that changed, a number as a number, an emptied optional one as null', () => {
    expect(changedAnswers(view, { tanks: '4', note: '', open_late: true })).toEqual({
      tanks: 4,
      note: null,
      open_late: true,
    });
  });

  it('leaves out a required answer that was emptied: the server would refuse to clear it', () => {
    expect(changedAnswers(view, { pump_state: null })).toBeNull();
  });

  it('counts a suggestion left in place as a change, so Save confirms it', () => {
    const open = makeOutletDetailsView({
      questions: [makeStateQuestion({ answer: makeAnswer({ suggested: '27' }) })],
    });
    expect(changedAnswers(open, {})).toEqual({ pump_state: '27' });
  });

  it('never sends an unknown kind', () => {
    const odd = makeOutletDetailsView({ questions: [makeQuestion('x', 'hologram', { answer: saved('a') })] });
    expect(changedAnswers(odd, { x: 'b' })).toBeNull();
  });
});

describe('what is shown as the saved answer', () => {
  it('writes each kind as plain words', () => {
    const state = makeStateQuestion({ answer: saved('10') });
    expect(answerText(state, 'hi', WORDS)).toBe('बिहार (Bihar)');
    expect(answerText(state, 'en', WORDS)).toBe('Bihar');
    expect(answerText(makeQuestion('y', 'yesno', { answer: saved(true) }), 'en', WORDS)).toBe('Yes');
    expect(answerText(makeQuestion('n', 'number', { answer: saved(7) }), 'en', WORDS)).toBe('7');
    expect(answerText(makeQuestion('d', 'date', { answer: saved('2026-11-05') }), 'en', WORDS)).toMatch(/5.*Nov.*2026/);
    expect(answerText(makeQuestion('t', 'text'), 'en', WORDS)).toBeNull();
  });

  it('shows an unknown kind\'s value, and a value that is no longer an option, as it is', () => {
    expect(answerText(makeQuestion('x', 'hologram', { answer: saved('beam') }), 'en', WORDS)).toBe('beam');
    expect(answerText(makeStateQuestion({ answer: saved('99') }), 'en', WORDS)).toBe('99');
  });

  it('leaves a date it cannot read alone', () => {
    expect(formatDay('soon', 'en')).toBe('soon');
  });

  it('knows whether anything has been answered', () => {
    expect(hasAnyAnswer(makeOutletDetailsView())).toBe(false);
    expect(hasAnyAnswer(makeOutletDetailsView({ questions: [makeStateQuestion({ answer: saved('06') })] }))).toBe(true);
  });
});
