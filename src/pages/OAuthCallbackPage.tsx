import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClient, ApiError } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/useAuth';
import {
  isLinkingFlow,
  isOAuthStateProcessed,
  markOAuthStateProcessed,
  takeOAuthState,
} from '@/auth/oauthFlow';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export default function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, tokenRef } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const code = params.get('code');
      const state = params.get('state');

      if (!code || !state) {
        setError('Missing code or state in OAuth callback.');
        return;
      }

      // Module-level dedup: StrictMode double-fires effects in dev, and a user
      // could land here twice via back/refresh. The OAuth code-for-token exchange
      // is one-shot — Google rejects a second use of the same code — so we must
      // run it at most once per state. Mark before any state-clearing or API
      // calls so the second invocation short-circuits cleanly.
      if (isOAuthStateProcessed(state)) return;
      markOAuthStateProcessed(state);

      const linking = isLinkingFlow();
      const expected = takeOAuthState();

      if (!expected || expected !== state) {
        setError('OAuth state mismatch — please try again.');
        return;
      }

      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: () => {},
      });
      const api = authApi(client);
      const providerSlug = (provider ?? 'google').toLowerCase();
      const providerName =
        providerSlug === 'github'
          ? 'GitHub'
          : providerSlug === 'microsoft'
            ? 'Microsoft'
            : 'Google';

      try {
        if (linking && tokenRef.current) {
          await api.linkOAuth({ provider: providerName, code, state });
        } else {
          const auth = await api.oauthCallback(providerSlug, code, state);
          signIn(auth);
        }
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'OAuth failed.');
      }
    })();
  }, [navigate, params, provider, signIn, tokenRef]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert role="alert" variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Skeleton className="h-12 w-48" />
    </div>
  );
}
