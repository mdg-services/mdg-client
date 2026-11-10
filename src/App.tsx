import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { NavigationProgress, RouteFallback } from '@/components/RouteFallback';
import { firstScreen } from '@/features/auth/firstScreen';
// Imported, not lazy: it is a redirect a few lines long, and a chunk request
// on a 2G link would cost far more than the code does.
import { OpenMyChat } from '@/features/chat/OpenMyChat';
import { EmbedStatus } from '@/features/embed/EmbedStatus';
import { isEmbedded } from '@/lib/embedMode';
import { lazyRoute, preloadScreens } from '@/lib/lazyRoute';
import { setMonitoringUser } from '@/lib/monitoring';
import { useAuthStore } from '@/store/auth';

// Route-level code splitting: each page (and the authenticated shell) is its own
// chunk, so the login screen no longer downloads chat/settings/staff — or
// the socket.io realtime stack that the shell pulls in. Pages use named exports,
// so remap each to a default export for React.lazy.
const AppShell = lazyRoute(() =>
  import('@/AppShell').then((m) => ({ default: m.AppShell })),
);
const LoginPage = lazyRoute(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazyRoute(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ChatListPage = lazyRoute(() =>
  import('@/pages/ChatListPage').then((m) => ({ default: m.ChatListPage })),
);
const ChatPage = lazyRoute(() =>
  import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })),
);
const ChatMediaPage = lazyRoute(() =>
  import('@/pages/ChatMediaPage').then((m) => ({ default: m.ChatMediaPage })),
);
const ChatInfoPage = lazyRoute(() =>
  import('@/pages/ChatInfoPage').then((m) => ({ default: m.ChatInfoPage })),
);
const ServicesPage = lazyRoute(() =>
  import('@/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })),
);
const StaffPage = lazyRoute(() =>
  import('@/pages/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const SettingsPage = lazyRoute(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SettingsProfilePage = lazyRoute(() =>
  import('@/pages/settings/ProfileInfoPage').then((m) => ({ default: m.SettingsProfilePage })),
);
const SettingsAccountPage = lazyRoute(() =>
  import('@/pages/settings/AccountPage').then((m) => ({ default: m.SettingsAccountPage })),
);
const SettingsTeamPage = lazyRoute(() =>
  import('@/pages/settings/TeamPage').then((m) => ({ default: m.SettingsTeamPage })),
);
// Settings → Help videos: MDG's short videos, played in the app. Its own chunk.
const HelpVideosPage = lazyRoute(() =>
  import('@/features/help/HelpVideosPage').then((m) => ({ default: m.HelpVideosPage })),
);
// Settings → Autopay: shown and stopped, never started, in the app. Its own chunk.
const AutopayPage = lazyRoute(() =>
  import('@/features/autopay/AutopayPage').then((m) => ({ default: m.AutopayPage })),
);
// Seen once, by a member who signed in with a temporary password: its own chunk,
// so nobody else downloads it.
const ForcedPasswordChange = lazyRoute(() =>
  import('@/features/auth/ForcedPasswordChange').then((m) => ({
    default: m.ForcedPasswordChange,
  })),
);
// Payments (ADR 0022). Their own chunk, so the Razorpay-facing code and its
// strings never reach a dealer who does not open the screen.
const PaymentsPage = lazyRoute(() =>
  import('@/features/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })),
);
const PaymentDetailPage = lazyRoute(() =>
  import('@/features/payments/PaymentDetailPage').then((m) => ({
    default: m.PaymentDetailPage,
  })),
);

/**
 * Bring down the screens a member is likely to open next, once the app is up,
 * so the tap that opens one needs no download. The chat itself comes first:
 * it is where nearly every session goes. On a 2G link only the first two.
 *
 * It also shields the session from a release made while the app stays open:
 * a screen already downloaded keeps working when the server's files change.
 */
function usePreloadScreens() {
  React.useEffect(
    () =>
      preloadScreens(
        [
          ChatPage,
          SettingsPage,
          ChatInfoPage,
          ChatMediaPage,
          ServicesPage,
          StaffPage,
          HelpVideosPage,
          SettingsProfilePage,
          SettingsAccountPage,
          SettingsTeamPage,
          LoginPage,
        ],
        [ChatPage, SettingsPage],
      ),
    [],
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
 *
 * INSIDE THE EXTENSION'S SIDE PANEL (`?embed=extension`, ADR 0032 §6) there is no
 * sign-in screen to go to: the panel hands the app its token and the app loads the
 * profile with it, so until both are in memory the panel's own status screen is
 * what shows — "Opening…", or "Signed out" once the server ended the sign-in.
 */
function ProtectedLayout() {
  const token = useAuthStore((s) => s.token);
  const hasUser = useAuthStore((s) => !!s.user);
  const mustChangePassword = useAuthStore((s) => !!s.user?.mustChangePassword);
  const location = useLocation();
  if (isEmbedded()) {
    if (!token || !hasUser) return <EmbedStatus loading={!!token} />;
  } else if (!token) {
    // Register on a phone nobody has signed in on, Sign in otherwise (`firstScreen.ts`).
    return <Navigate to={firstScreen()} replace state={{ from: location.pathname }} />;
  }
  if (mustChangePassword) return <ForcedPasswordChange />;
  return <SignedInShell />;
}

function SignedInShell() {
  usePreloadScreens();
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
  // The panel has no Sign in and no Register: both addresses go to the chat, which
  // shows the panel's own status screen until the extension has signed it in.
  const embedded = isEmbedded();
  const location = useLocation();

  return (
    // Keyed on the address, so a screen that failed does not keep the whole app
    // on the error page: Back, or any other screen, draws again.
    <ChunkErrorBoundary resetKey={location.pathname}>
      <NavigationProgress />
      <React.Suspense fallback={<RouteFallback className="min-h-full" />}>
        <Routes>
          <Route
            path="/login"
            element={embedded ? <Navigate to="/chat" replace /> : <LoginPage />}
          />
          <Route
            path="/register"
            element={embedded ? <Navigate to="/chat" replace /> : <RegisterPage />}
          />
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
