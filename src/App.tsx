import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { Spinner } from '@/components/ui';
// Imported, not lazy: it is a redirect a few lines long, and a chunk request
// on a 2G link would cost far more than the code does.
import { OpenMyChat } from '@/features/chat/OpenMyChat';
import { useT } from '@/lib/i18n';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { setMonitoringUser } from '@/lib/monitoring';
import { useAuthStore } from '@/store/auth';

// Route-level code splitting: each page (and the authenticated shell) is its own
// chunk, so the login screen no longer downloads chat/settings/staff — or
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
const ServicesPage = lazyWithRetry(() =>
  import('@/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })),
);
const StaffPage = lazyWithRetry(() =>
  import('@/pages/StaffPage').then((m) => ({ default: m.StaffPage })),
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
// Settings → Help videos: MDG's short videos, played in the app. Its own chunk.
const HelpVideosPage = lazyWithRetry(() =>
  import('@/features/help/HelpVideosPage').then((m) => ({ default: m.HelpVideosPage })),
);
// Settings → Autopay: shown and stopped, never started, in the app. Its own chunk.
const AutopayPage = lazyWithRetry(() =>
  import('@/features/autopay/AutopayPage').then((m) => ({ default: m.AutopayPage })),
);
// Seen once, by a member who signed in with a temporary password: its own chunk,
// so nobody else downloads it.
const ForcedPasswordChange = lazyWithRetry(() =>
  import('@/features/auth/ForcedPasswordChange').then((m) => ({
    default: m.ForcedPasswordChange,
  })),
);
// Payments (ADR 0022). Their own chunk, so the Razorpay-facing code and its
// strings never reach a dealer who does not open the screen.
const PaymentsPage = lazyWithRetry(() =>
  import('@/features/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })),
);
const PaymentDetailPage = lazyWithRetry(() =>
  import('@/features/payments/PaymentDetailPage').then((m) => ({
    default: m.PaymentDetailPage,
  })),
);

/**
 * What a screen looks like while its code is coming down the wire.
 *
 * A bare spinner is fine for the second or two this takes on wifi. On a 2G
 * forecourt link the first tap on Settings or Staff could sit here for a
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
 *
 * A member who signed in with a temporary password (one MDG's team gave them) is
 * stopped one step earlier: they choose their own before anything else. The shell
 * is not mounted for them at all, since the server refuses everything it would
 * ask for. `mustChangePassword` comes with the sign-in, and is set too when any
 * call is answered `PASSWORD_CHANGE_REQUIRED` (`lib/api.ts`).
 */
function ProtectedLayout() {
  const token = useAuthStore((s) => s.token);
  const mustChangePassword = useAuthStore((s) => !!s.user?.mustChangePassword);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (mustChangePassword) return <ForcedPasswordChange />;
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
            <Route path="/settings/help" element={<HelpVideosPage />} />
            {/* Autopay: reached from the Help screen and the Payments page, never
                from a Settings row. The owner can see it and stop it; nothing on it
                starts one (features/payments/policy.ts). */}
            <Route path="/settings/autopay" element={<AutopayPage />} />
            {/* The old name for Settings (it was the Profile tab). A SECOND MOUNT
                and not a redirect: nothing about it needs to change address. */}
            <Route path="/profile" element={<SettingsPage />} />
            {/* Services — Settings → Your services. */}
            <Route path="/services" element={<ServicesPage />} />
            {/* Staff Points — owner/manager tool, Settings → Warriors & points. */}
            <Route path="/staff" element={<StaffPage />} />
            {/* Payments — what MDG has asked this pump to pay, and what it has
                paid (ADR 0022). NO MENU OR SETTINGS ROW POINTS HERE YET: the
                owner will say where it belongs, so for now it opens by address
                only. Inside the Android app both screens are read-only (no Pay
                button, no link on to a payment page) — that rule lives in
                features/payments/policy.ts. */}
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/payments/:id" element={<PaymentDetailPage />} />
            {/* ASKS LIVE IN THE CHAT NOW. The paper list (`/asks`, `/documents`),
                the density register screen (`/density`) and Pump health
                (`/kavach`) are gone: MDG asks for each thing in the chat, on a
                message with a "Send photo" button, and marks it received there.

                The four addresses are kept ONLY so a link already out in the
                world still lands somewhere that makes sense — a push from
                last week (`/documents?ask=<id>`), the native shell's shipped
                `density` and `kavach` tokens, a bookmark. Each opens the
                member's own chat, where the ask is waiting. */}
            <Route path="/asks" element={<OpenMyChat />} />
            <Route path="/documents" element={<OpenMyChat />} />
            <Route path="/density" element={<OpenMyChat />} />
            <Route path="/kavach" element={<OpenMyChat />} />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </React.Suspense>
    </ChunkErrorBoundary>
  );
}
