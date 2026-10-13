import type { ChatAskStates } from '@/hooks/api/useChatAskStates';
import type { Message } from '@dk/shared/types';

/**
 * What to draw under a request MDG posted in the chat, once the server has said
 * where the request stands.
 *
 *  - `open`      the dealer's turn: the "Send photo" button (and, when the
 *                request takes a PDF, "Choose file"), plus MDG's reason when a
 *                previous answer was sent back
 *  - `sent`      answered, MDG has not checked it yet
 *  - `received`  MDG has it
 *  - `failed`    the question "where does this stand" could not be answered — said
 *                so, with a retry. NEVER drawn as "nothing to do": a request that
 *                cannot be checked is not a request that is closed.
 *  - `none`      draw only the request's own title and day — it is closed, it is
 *                an older post of a request that has been posted again, the server
 *                does not know it, or we are still asking
 */
export type AskPhase = 'open' | 'sent' | 'received' | 'failed' | 'none';

export interface AskView {
  phase: AskPhase;
  /** MDG's words when it sent an answer back — verbatim, only with `open`. */
  reason?: string;
}

const NONE: AskView = { phase: 'none' };

export function askViewOf(message: Message, states: ChatAskStates | undefined): AskView {
  const ask = message.ask;
  if (!ask || !states) return NONE;
  // The same request posted twice (a nudge): only the newest post is live.
  if (states.latestIdByRef.get(ask.ref) !== message.id) return NONE;

  const state = states.byRef.get(ask.ref);
  if (!state) return states.status === 'failed' ? { phase: 'failed' } : NONE;

  switch (state.status) {
    case 'open':
      return state.rejectReason
        ? { phase: 'open', reason: state.rejectReason }
        : { phase: 'open' };
    case 'sent':
      return { phase: 'sent' };
    case 'received':
      return { phase: 'received' };
    default:
      return NONE;
  }
}
