import type {
  OutletDetailAnswer,
  OutletDetailKind,
  OutletDetailsQuestionView,
  OutletDetailsView,
} from '@dk/shared/types';

/** An answer nobody has given. */
export function makeAnswer(over: Partial<OutletDetailAnswer> = {}): OutletDetailAnswer {
  return { value: null, savedAt: null, savedVia: null, savedByName: null, suggested: null, ...over };
}

/** An answer somebody saved. */
export function saved(value: OutletDetailAnswer['value']): OutletDetailAnswer {
  return makeAnswer({ value, savedAt: '2026-11-12T10:00:00.000Z', savedVia: 'dealer' });
}

/** Four states, written in the order the server would send them (by code), not alphabetically. */
export const STATE_OPTIONS = [
  { value: '06', label: { hi: 'हरियाणा', en: 'Haryana' } },
  { value: '07', label: { hi: 'दिल्ली', en: 'Delhi' } },
  { value: '10', label: { hi: 'बिहार', en: 'Bihar' } },
  { value: '27', label: { hi: 'महाराष्ट्र', en: 'Maharashtra' } },
];

/** One question of any kind, with words in both languages. */
export function makeQuestion(
  id: string,
  kind: OutletDetailKind | string,
  over: Partial<OutletDetailsQuestionView> = {},
): OutletDetailsQuestionView {
  return {
    id,
    kind: kind as OutletDetailKind,
    label: { hi: `${id} हिंदी`, en: `${id} english` },
    required: false,
    answer: makeAnswer(),
    ...over,
  };
}

/** The question the form opens with: which state the pump stands in. */
export function makeStateQuestion(over: Partial<OutletDetailsQuestionView> = {}) {
  return makeQuestion('pump_state', 'state', {
    label: { hi: 'आपका पंप किस राज्य में है?', en: 'Which state is your pump in?' },
    help: { hi: 'बैंक की छुट्टियाँ राज्य के हिसाब से होती हैं।', en: 'Bank holidays are set state by state.' },
    options: STATE_OPTIONS,
    required: true,
    ...over,
  });
}

/** A form: the state question alone unless other questions are given. The owner is looking. */
export function makeOutletDetailsView(over: Partial<OutletDetailsView> = {}): OutletDetailsView {
  const questions = over.questions ?? [makeStateQuestion()];
  return {
    title: { hi: 'पंप की जानकारी', en: 'Pump details' },
    intro: { hi: 'कुछ बातें बता दीजिए।', en: 'Please tell us a few things.' },
    questions,
    complete: questions.every((q) => !q.required || q.answer.value !== null),
    canEdit: true,
    ...over,
  };
}
