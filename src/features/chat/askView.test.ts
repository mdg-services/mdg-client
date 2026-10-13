import { describe, expect, it } from 'vitest';

import type { ChatAskStates } from '@/hooks/api/useChatAskStates';
import { makeMessage } from '@/test/utils';
import type { ChatAskState } from '@dk/shared/types';

import { askViewOf } from './askView';

const REF = 'doc:ask1';

function states(
  list: ChatAskState[],
  over: Partial<ChatAskStates> = {},
  latest: Record<string, string> = { [REF]: 'm1' },
): ChatAskStates {
  return {
    status: 'ready',
    byRef: new Map(list.map((s) => [s.ref, s])),
    latestIdByRef: new Map(Object.entries(latest)),
    refetch: () => undefined,
    ...over,
  };
}

const message = (id = 'm1', ref = REF) =>
  makeMessage({ id, ask: { ref, kind: 'document', title: 'Fire NOC' } });

describe('askViewOf — what to draw under a request', () => {
  it.each([
    ['open', { phase: 'open' }],
    ['sent', { phase: 'sent' }],
    ['received', { phase: 'received' }],
    ['closed', { phase: 'none' }],
  ] as const)('a request that is %s draws %o', (status, expected) => {
    expect(askViewOf(message(), states([{ ref: REF, status }]))).toEqual(expected);
  });

  it('carries MDG\'s reason with an open request that was sent back', () => {
    expect(
      askViewOf(message(), states([{ ref: REF, status: 'open', rejectReason: 'Retake it' }])),
    ).toEqual({ phase: 'open', reason: 'Retake it' });
  });

  it('draws nothing for a message that asks nothing', () => {
    expect(askViewOf(makeMessage({ body: 'plain' }), states([]))).toEqual({ phase: 'none' });
  });

  it('draws nothing before there is anything to say (no states object yet)', () => {
    expect(askViewOf(message(), undefined)).toEqual({ phase: 'none' });
  });

  it('draws nothing while the first answer is still on its way', () => {
    expect(askViewOf(message(), states([], { status: 'loading' }))).toEqual({ phase: 'none' });
  });

  it('says it could not check — never "nothing to do" — when the question failed', () => {
    expect(askViewOf(message(), states([], { status: 'failed' }))).toEqual({ phase: 'failed' });
  });

  it('draws nothing for a request the server did not name (not this dealer\'s)', () => {
    expect(askViewOf(message(), states([{ ref: 'doc:other', status: 'open' }]))).toEqual({
      phase: 'none',
    });
  });

  it('only the NEWEST post of a request is live — an older post of it draws nothing', () => {
    const s = states([{ ref: REF, status: 'open' }], {}, { [REF]: 'newer' });
    expect(askViewOf(message('older'), s)).toEqual({ phase: 'none' });
    expect(askViewOf(message('newer'), s)).toEqual({ phase: 'open' });
  });
});
