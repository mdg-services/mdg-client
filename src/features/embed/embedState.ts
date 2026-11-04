import { create } from 'zustand';

/**
 * Where the embedded app (`?embed=extension`) stands before it is signed in.
 *
 * - `waiting`    — started, and the extension has not handed over a sign-in yet;
 * - `signed-out` — it had one, and the server (or the Log out button) ended it;
 * - `failed`     — it has the token but could not load the profile with it (no network).
 *
 * "Loading the profile" is not a phase of its own: it is a token with no user yet,
 * and `ProtectedLayout` reads it from the sign-in store.
 */
export type EmbedPhase = 'waiting' | 'signed-out' | 'failed';

interface EmbedState {
  phase: EmbedPhase;
  /** Try the profile again with the token already held. Set by the bridge while it runs. */
  retry: (() => void) | null;
}

export const useEmbedStore = create<EmbedState>()(() => ({
  phase: 'waiting',
  retry: null,
}));
