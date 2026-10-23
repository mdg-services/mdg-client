import * as React from 'react';

/**
 * One id for one filled-in form (the website's own, `mdg-landing/src/lib/submissionId.ts`).
 *
 * Now that a failed send says so instead of pretending to have worked, a dealer
 * on a bad link presses Submit again — and the first press may have got through
 * with only its answer lost. The same form carries the same id both times, so the
 * server knows it is one registration and not two. Different content gets a new
 * id, so a corrected retry is never mistaken for a replay of the first.
 *
 * `crypto.randomUUID` only exists on secure pages; an older WebView falls back
 * to a time-and-random string. Both fit the server's rule: letters, digits,
 * `-` and `_`, 8 to 64 characters.
 */
export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

/** The id for the form as it stands: ask with what is about to be sent. Kept in memory only. */
export function useSubmissionId(): (content: unknown) => string {
  const last = React.useRef<{ key: string; id: string } | null>(null);
  return (content) => {
    const key = JSON.stringify(content);
    if (last.current?.key !== key) last.current = { key, id: newSubmissionId() };
    return last.current.id;
  };
}
