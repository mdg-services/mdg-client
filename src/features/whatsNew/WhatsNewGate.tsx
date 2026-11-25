import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useMatch } from 'react-router-dom';

import { mustChooseLanguage } from '@/components/ChooseLanguageScreen';
import { parseReportPath, useRealLocation } from '@/features/reports/reportNav';
import { useMe } from '@/hooks/api/useMe';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

import { isPhoneApp } from './isPhone';
import { WhatsNewVideo } from './lazy';

/**
 * Decides when the "what is new" video opens (ADR 0056, "A one-time video on the next phone
 * open"), and records that it was shown.
 *
 * IT OPENS ONCE THE SERVER SAYS, IN THIS APP OPEN'S OWN /me ANSWER, THAT THE PERSON IS OWED IT
 * (`whatsNewVideo`; the copy saved on the phone is never trusted) AND the dealer is
 * on the Today page ("/") in the phone app with nothing in front of it: no report overlay (a
 * push that cold-opens a report is never covered; it waits until they are back on Today), not
 * over the one-time language choice, not over the forced password change, never on a desktop
 * browser or in the extension's side panel.
 *
 * ONE TRY PER OPEN. Once it has opened, it does not open again until the app is opened anew,
 * whatever happens: closed early, could not load. It is "shown" only when it really starts
 * playing; then the server is told and the signed-in user's field is cleared at once.
 */
export function WhatsNewGate() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  // The profile saved on the phone can be stale (a second phone, or a refresh that landed while
  // the "seen" call was in flight). Only the answer this app open got from the server counts.
  const me = useMe();
  const fresh = me.isSuccess && me.isFetchedAfterMount;
  const onToday = !!useMatch({ path: '/', end: true });
  const reportOpen = parseReportPath(useRealLocation().pathname) !== null;
  const [openId, setOpenId] = React.useState<string | null>(null);
  const tried = React.useRef(false);

  const owed = fresh ? (me.data?.whatsNewVideo ?? null) : null;
  const clear = !!user && !user.mustChangePassword && !mustChooseLanguage(user);

  React.useEffect(() => {
    if (tried.current || !owed || !clear || !onToday || reportOpen || !isPhoneApp()) return;
    tried.current = true;
    setOpenId(owed);
  }, [owed, clear, onToday, reportOpen]);

  const onStarted = React.useCallback(() => {
    const id = openId;
    if (!id) return;
    // Out of this session's /me at once, so nothing can open it a second time.
    const current = useAuthStore.getState().user;
    if (current) setUser({ ...current, whatsNewVideo: null });
    qc.setQueryData(['me'], (old: unknown) => (old ? { ...(old as object), whatsNewVideo: null } : old));
    // If this fails the server offers it again on the next open; that is acceptable.
    void api.post(`/v1/me/whats-new/${encodeURIComponent(id)}/seen`).catch(() => undefined);
  }, [openId, setUser, qc]);

  if (!openId) return null;
  return (
    <React.Suspense fallback={null}>
      <WhatsNewVideo videoId={openId} onStarted={onStarted} onClose={() => setOpenId(null)} />
    </React.Suspense>
  );
}
