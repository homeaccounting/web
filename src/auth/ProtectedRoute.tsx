import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

export function ProtectedRoute() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    const params = new URLSearchParams({ redirectTo: location.pathname + location.search });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return <Outlet />;
}
