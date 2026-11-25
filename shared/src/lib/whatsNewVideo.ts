/**
 * The one "what is new" video the dealer app plays by itself, once per person, the
 * first time they open the phone app after a release (ADR 0056, "A one-time video on
 * the next phone open").
 *
 * Shared because the server decides who is owed it (`whatsNewVideo` on the signed-in
 * user) and the app plays it; both must name the same video, and the "seen" route only
 * accepts this id. A later release changes `id` and `accountsBefore` here, and every
 * dealer login that has not seen THAT video is owed it again.
 *
 * `accountsBefore` is the release day: a login created after it is a new dealer, who
 * gets the usual onboarding videos instead of a tour of what changed.
 */
export const WHATS_NEW_VIDEO = {
  id: 'whats_new_today',
  accountsBefore: '2026-11-26T00:00:00+05:30',
} as const;
