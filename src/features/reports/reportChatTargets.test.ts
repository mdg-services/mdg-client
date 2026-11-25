import type { InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { Message, TodayTask } from '@dk/shared/types';

import { askInFeed, askInThread, taskInFeed } from './reportChatTargets';

const task = (over: Partial<TodayTask> = {}): TodayTask => ({
  id: 't1',
  kind: 'ask',
  title: 'x',
  since: '2026-11-24T05:00:00.000Z',
  conversationId: 'c1',
  messageId: 'm1',
  ...over,
});

describe('askInFeed: the box that asks for a photo, from the Today feed\'s open tasks', () => {
  it('finds a photo ask by its reference, in the chat the box lives in', () => {
    const feed = {
      tasks: [
        task({ id: 'ask:kv:9', conversationId: 'c2', messageId: 'm9', action: { type: 'photo', askRef: 'kv:9', acceptsFile: false } }),
        task({ id: 'ask:kv:10', messageId: 'm10', action: { type: 'photo', askRef: 'kv:10', acceptsFile: false } }),
      ],
    };
    expect(askInFeed(feed, 'kv:9')).toEqual({ conversationId: 'c2', messageId: 'm9' });
    expect(askInFeed(feed, 'kv:10')).toEqual({ conversationId: 'c1', messageId: 'm10' });
  });

  it('finds a sign-a-letter ask too: its task id carries the reference', () => {
    const feed = { tasks: [task({ id: 'ask:doc:77', kind: 'sign_letter', messageId: 'm77', action: { type: 'open_chat' } })] };
    expect(askInFeed(feed, 'doc:77')).toEqual({ conversationId: 'c1', messageId: 'm77' });
  });

  it('is null when no task asks for it (done, or never open), or when there is no feed', () => {
    expect(askInFeed({ tasks: [task({ id: 'ask:kv:1' })] }, 'kv:2')).toBeNull();
    expect(askInFeed({ tasks: [] }, 'kv:1')).toBeNull();
    expect(askInFeed(undefined, 'kv:1')).toBeNull();
  });
});

describe('taskInFeed: the newest open box of a job', () => {
  it('takes the newest of its kind', () => {
    const feed = {
      tasks: [
        task({ id: 'a', kind: 'du_otp', messageId: 'old', since: '2026-11-23T05:00:00.000Z' }),
        task({ id: 'b', kind: 'du_otp', messageId: 'new', since: '2026-11-24T05:00:00.000Z' }),
        task({ id: 'c', kind: 'mock_drill', messageId: 'drill' }),
      ],
    };
    expect(taskInFeed(feed, 'du_otp')).toEqual({ conversationId: 'c1', messageId: 'new' });
    expect(taskInFeed(feed, 'mock_drill')?.messageId).toBe('drill');
    expect(taskInFeed(feed, 'declarations')).toBeNull();
    expect(taskInFeed(undefined, 'du_otp')).toBeNull();
  });
});

describe('askInThread: the thread\'s own loaded messages', () => {
  const msg = (id: string, createdAt: string, ref?: string) =>
    ({ id, createdAt, ...(ref ? { ask: { ref, kind: 'photo', title: 'x' } } : {}) }) as unknown as Message;
  const thread = (...pages: Message[][]): InfiniteData<Message[]> => ({ pages, pageParams: pages.map(() => undefined) });

  it('takes the newest message that asks for the reference, across pages', () => {
    const data = thread(
      [msg('new', '2026-11-24T08:00:00.000Z', 'kv:9'), msg('other', '2026-11-24T09:00:00.000Z', 'kv:1')],
      [msg('old', '2026-11-22T08:00:00.000Z', 'kv:9')],
    );
    expect(askInThread(data, 'c1', 'kv:9')).toEqual({ conversationId: 'c1', messageId: 'new' });
  });

  it('skips a message still on its way out, and is null with nothing loaded', () => {
    expect(askInThread(thread([msg('temp-1', '2026-11-24T08:00:00.000Z', 'kv:9')]), 'c1', 'kv:9')).toBeNull();
    expect(askInThread(undefined, 'c1', 'kv:9')).toBeNull();
    expect(askInThread(thread([msg('a', '2026-11-24T08:00:00.000Z')]), 'c1', 'kv:9')).toBeNull();
  });
});
