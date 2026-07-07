import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { Spinner } from '@/components/ui';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
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
const ChatPage = lazyWithRetry(() =>
  import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })),
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
const ProfilePage = lazyWithRetry(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

function FullScreenSpinner() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Spinner size={22} />
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

export function App() {
  return (
    <ChunkErrorBoundary>
      <React.Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<ChatPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/kavach" element={<KavachPage />} />
            {/* Services demoted from the bottom bar; still reachable from Profile. */}
            <Route path="/services" element={<ServicesPage />} />
            {/* Staff Points — owner/manager tool, reached from Profile (not a 5th tab). */}
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </React.Suspense>
    </ChunkErrorBoundary>
  );
}
