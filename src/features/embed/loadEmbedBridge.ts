import type * as EmbedBridgeModule from './embedBridge';
import { useEmbedStore } from './embedState';

/**
 * Start the bridge to the extension's side panel from its own chunk, so the web app and
 * the phone shell never download it (ADR 0032 §6). Called once, from `main.tsx`.
 *
 * A chunk that cannot be fetched (a new deploy landing while the panel loads, a dropped
 * connection) must not leave the panel on "Opening your chat…" for good: nothing would
 * ever ask the extension for a sign-in. It shows the load-failed screen instead, whose
 * button reloads the page (there is no running bridge to retry).
 */
export function loadEmbedBridge(
  load: () => Promise<Pick<typeof EmbedBridgeModule, 'startEmbedBridge'>> = () =>
    import('./embedBridge'),
): Promise<void> {
  return load()
    .then((m) => {
      m.startEmbedBridge();
    })
    .catch(() => {
      useEmbedStore.setState({ phase: 'failed', retry: null });
    });
}
