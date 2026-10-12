import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { setMonitoringUser } from '@/lib/monitoring';
import { useAuthStore } from '@/store/auth';

// Route-level code splitting: each page (and the authenticated shell) is its own
// chunk, so the login screen no longer downloads chat/settings/kavach/staff — or
// the socket.io realtime stack that the shell pulls in. Pages use named exports,
// so remap each to a default export for React.lazy.
const AppShell = lazyWithRetry(() =>
  import('@/AppShell').then((m) => ({ default: m.AppShell })),
);
const LoginPage = lazyWithRetry(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazyWithRetry(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
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
const ChatInfoPage = lazyWithRetry(() =>
  import('@/pages/ChatInfoPage').then((m) => ({ default: m.ChatInfoPage })),
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
const DocumentsPage = lazyWithRetry(() =>
  import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const SettingsPage = lazyWithRetry(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SettingsProfilePage = lazyWithRetry(() =>
  import('@/pages/settings/ProfileInfoPage').then((m) => ({ default: m.SettingsProfilePage })),
);
const SettingsAccountPage = lazyWithRetry(() =>
  import('@/pages/settings/AccountPage').then((m) => ({ default: m.SettingsAccountPage })),
);
const SettingsTeamPage = lazyWithRetry(() =>
  import('@/pages/settings/TeamPage').then((m) => ({ default: m.SettingsTeamPage })),
);

/**
 * What a screen looks like while its code is coming down the wire.
 *
 * A bare spinner is fine for the second or two this takes on wifi. On a 2G
 * forecourt link the first tap on Settings or Pump health could sit here for a
 * minute with nothing but a small grey dot on an empty screen — no words, no way to
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
 * which hosts the app-wide realtime hooks and an <Outlet/> for the active
 * screen. Rendered once by the layout route, so the shell persists as the dealer
 * moves between screens.
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
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedLayout />}>
            {/* The app is the chat. Its first screen is the conversation LIST,
                always — even for a member with a single thread, as WhatsApp
                does — and everything else hangs off the ⋮ menu there.
                `/chat?c=<id>` (what a push naming only a conversation turns
                into in the native shell) is sent on into the thread by the list
                itself. */}
            <Route path="/" element={<ChatListPage />} />
            <Route path="/chat" element={<ChatListPage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            {/* Everything ever shared in a thread: media / docs / links. */}
            <Route path="/chat/:id/media" element={<ChatMediaPage />} />
            {/* Who is in the thread, and a way into its media. */}
            <Route path="/chat/:id/info" element={<ChatInfoPage />} />
            {/* Settings, and what hangs off it. Reached from the ⋮ menu on the
                chat list. */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/profile" element={<SettingsProfilePage />} />
            <Route path="/settings/account" element={<SettingsAccountPage />} />
            <Route path="/settings/team" element={<SettingsTeamPage />} />
            {/* The old name for Settings (it was the Profile tab). A SECOND MOUNT
                and not a redirect, for the same reason `/asks` is one below. */}
            <Route path="/profile" element={<SettingsPage />} />
            {/* Pump health — Settings → Pump health, for a pump with a Kavach
                programme. Kept at its old path: it is the dealer's only way to
                answer MDG's "send a photo" requests, and pushes already on
                phones still point here. */}
            <Route path="/kavach" element={<KavachPage />} />
            {/* Services — Settings → Your services. */}
            <Route path="/services" element={<ServicesPage />} />
            {/* Staff Points — owner/manager tool, Settings → Warriors & points. */}
            <Route path="/staff" element={<StaffPage />} />
            {/* The daily density-register photo. Reached from Settings and from
                a push. */}
            <Route path="/density" element={<DensityPage />} />
            {/* Every paper in this dealer's life — what MDG is waiting for, and
                what MDG already holds. Reached from the ask bar under the
                top bar, from Settings, and from a push.

                TWO PATHS, ONE PAGE, and the second is not a nicety. The server
                builds its deep link as `/documents?ask=<id>`
                (`services/documents/notify.ts`), which is the string the native
                bridge hands the WebView untouched — so a push that landed on a
                route this app did not have would drop the dealer on the chat
                list with no idea why. `/asks` is the name the app used for
                itself before the screen grew a filing cabinet; `/documents` is
                the name already baked into notifications that are on their way.
                Both must resolve, and both must keep answering `?ask=<id>`.

                `/asks` is a SECOND MOUNT AND NOT A REDIRECT. A redirect would
                have to carry the query string across by hand — and the day
                somebody wrote `<Navigate to="/documents" replace />` without
                it, every push already on a phone would land on the list with
                its scroll position thrown away and nothing to say why. Two
                mounts cannot lose a parameter neither of them touches. */}
            <Route path="/asks" element={<DocumentsPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </React.Suspense>
    </ChunkErrorBoundary>
  );
}
