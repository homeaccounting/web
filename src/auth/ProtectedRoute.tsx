import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useDataChangeSignal } from '@/features/sync/useDataChangeSignal';
import { useAuth } from './useAuth';

export function ProtectedRoute() {
  // Mounted once for every logged-in route tree. Self-gates on session (the
  // hook is a no-op — disabled query — while logged out), so it's safe to
  // call unconditionally here rather than after the redirect check below.
  useDataChangeSignal();
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    const params = new URLSearchParams({ redirectTo: location.pathname + location.search });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return <Outlet />;
}
