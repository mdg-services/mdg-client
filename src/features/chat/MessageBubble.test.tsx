import { render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { makeMessage } from '@/test/utils';

import { MessageBubble } from './MessageBubble';

function renderBubble(message: ReturnType<typeof makeMessage>, mine = true) {
  return render(<MessageBubble message={message} mine={mine} />);
}
const BLUE = '34b7f1';

describe('MessageBubble delivery ticks', () => {
  it('shows a clock for an unconfirmed temp message', () => {
    const { container } = renderBubble(makeMessage({ id: 'temp-1', senderId: 'u1' }));
    expect(container.querySelector('.lucide-clock')).toBeTruthy();
  });

  it('shows a single check when sent but not delivered', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: [], readBy: [] }),
    );
    expect(container.querySelector('.lucide-check')).toBeTruthy();
    expect(container.querySelector('.lucide-check-check')).toBeFalsy();
  });

  it('shows a plain double check when delivered but not read', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u2'], readBy: [] }),
    );
    const dbl = container.querySelector('.lucide-check-check');
    expect(dbl).toBeTruthy();
    expect(dbl?.getAttribute('class') ?? '').not.toContain(BLUE);
  });

  it('shows a blue double check when read', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u2'], readBy: ['u2'] }),
    );
    const dbl = container.querySelector('.lucide-check-check');
    expect(dbl?.getAttribute('class') ?? '').toContain(BLUE);
  });

  it('renders no ticks for the other party’s messages', () => {
    const { container } = renderBubble(makeMessage({ id: 'r1', senderId: 'u2' }), false);
    expect(
      container.querySelector('.lucide-clock, .lucide-check, .lucide-check-check'),
    ).toBeFalsy();
  });

  it('ignores the sender’s own id in deliveredTo/readBy (still a single check)', () => {
    const { container } = renderBubble(
      makeMessage({ id: 'r1', senderId: 'u1', deliveredTo: ['u1'], readBy: ['u1'] }),
    );
    expect(container.querySelector('.lucide-check')).toBeTruthy();
    expect(container.querySelector('.lucide-check-check')).toBeFalsy();
  });

  it('is wrapped in React.memo', () => {
    expect((MessageBubble as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    );
  });
});
