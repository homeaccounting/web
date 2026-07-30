import { Navigate, useParams, useSearchParams } from 'react-router-dom';

// Permanent redirect for legacy single-account deep links:
//   /accounts/:id[?period…] → /transactions?accounts=:id[&period…]
// Preserves the existing period/from/to search and sets a fresh single scope.
export default function AccountRedirect() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (id) next.set('accounts', id);
  return <Navigate to={{ pathname: '/transactions', search: `?${next.toString()}` }} replace />;
}
