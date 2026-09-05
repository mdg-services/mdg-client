import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { setMonitoringUser } from '@/lib/monitoring';
import { useAuthStore } from '@/store/auth';

// Route-level code splitting: each page (and the authenticated shell) is its own
// chunk, so the login screen no longer downloads chat/records/kavach/staff — or
// the socket.io realtime stack that the shell pulls in. Pages use named exports,
// so remap each to a default export for React.lazy.
const AppShell = lazyWithRetry(() =>
  import('@/AppShell').then((m) => ({ default: m.AppShell })),
);
const LoginPage = lazyWithRetry(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const ChatListPage = lazyWithRetry(() =>
  import('@/pages/ChatListPage').then((m) => ({ default: m.ChatListPage })),
);
const ChatPage = lazyWithRetry(() =>
  import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })),
);
const ChatMediaPage = lazyWithRetry(() =>
  import('@/pages/ChatMediaPage').then((m) => ({ default: m.ChatMediaPage })),
);
const RecordsPage = lazyWithRetry(() =>
  import('@/pages/RecordsPage').then((m) => ({ default: m.RecordsPage })),
);
const KavachPage = lazyWithRetry(() =>
  import('@/pages/KavachPage').then((m) => ({ default: m.KavachPage })),
);
const ServicesPage = lazyWithRetry(() =>
  import('@/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })),
);
const StaffPage = lazyWithRetry(() =>
  import('@/pages/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const DensityPage = lazyWithRetry(() =>
  import('@/pages/DensityPage').then((m) => ({ default: m.DensityPage })),
);
const AsksPage = lazyWithRetry(() =>
  import('@/pages/AsksPage').then((m) => ({ default: m.AsksPage })),
);
const ProfilePage = lazyWithRetry(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

/**
 * What a screen looks like while its code is coming down the wire.
 *
 * A bare spinner is fine for the second or two this takes on wifi. On a 2G
 * forecourt link the first tap on Reports or Kavach could sit here for a minute
 * with nothing but a small grey dot on an empty screen — no words, no way to
 * tell it apart from a broken app, and nothing to press. After six seconds it
 * says what is happening and offers the reload, which is the same escape the
 * chunk-error boundary gives when the download fails outright.
 */
function FullScreenSpinner() {
  const t = useT();
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-8">
      <Spinner size={22} />
      {slow ? (
        <>
          <p className="text-center text-sm text-text-muted">{t('app.stillLoading')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-text-inverse active:opacity-90"
          >
            {t('common.retry')}
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * The authenticated layout: gate on the token, then render the (lazy) shell,
 * which hosts the tab bar and an <Outlet/> for the active page. Rendered once by
 * the layout route, so the shell persists across tab navigations.
 */
function ProtectedLayout() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AppShell />;
}

/**
 * Tell the error reporter who is reporting — by opaque id only.
 *
 * Enough to answer the question that actually gets asked ("is this the dealer who
 * complained, and is it only them?") without shipping a name, an email or a phone
 * number to a third party.
 */
function useMonitoringIdentity() {
  const user = useAuthStore((s) => s.user);
  React.useEffect(() => {
    setMonitoringUser(
      user
        ? { id: user.id, role: user.role, dealerId: user.dealerId ?? undefined }
        : null,
    );
  }, [user]);
}

export function App() {
  useMonitoringIdentity();

  return (
    <ChunkErrorBoundary>
      <React.Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
            {/* Chat: a conversation LIST, and a per-thread view. Single-thread
                members are auto-forwarded from the list straight into their chat. */}
            <Route path="/" element={<ChatListPage />} />
            <Route path="/chat" element={<ChatListPage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            {/* Everything ever shared in a thread: media / docs / links. */}
            <Route path="/chat/:id/media" element={<ChatMediaPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/kavach" element={<KavachPage />} />
            {/* Services demoted from the bottom bar; still reachable from Profile. */}
            <Route path="/services" element={<ServicesPage />} />
            {/* Staff Points — owner/manager tool, reached from Profile (not a 5th tab). */}
            <Route path="/staff" element={<StaffPage />} />
            {/* The daily density-register photo. Reached from Profile and from
                a push — the tab bar stays four. */}
            <Route path="/density" element={<DensityPage />} />
            {/* Every paper MDG is asking this dealer for. Reached from the ask
                bar under the header, from Profile, and from a push.

                TWO PATHS, ONE PAGE, and the second is not a nicety. The server
                builds its deep link as `/documents?ask=<id>`
                (`services/documents/notify.ts`), which is the string the native
                bridge hands the WebView untouched — so a push that landed on a
                route this app did not have would drop the dealer on the chat
                list with no idea why. `/asks` is the name the app uses for
                itself; `/documents` is the name already baked into notifications
                that are on their way. Both must resolve. */}
            <Route path="/asks" element={<AsksPage />} />
            <Route path="/documents" element={<AsksPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </React.Suspense>
    </ChunkErrorBoundary>
  );
}
