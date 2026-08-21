import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClient, ApiError, baseUrl } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/useAuth';
import {
  isLinkingFlow,
  isOAuthStateProcessed,
  markOAuthStateProcessed,
  takeOAuthState,
  takeLinkReturnTo,
} from '@/auth/oauthFlow';

export default function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, tokenRef } = useAuth();
  const { t } = useTranslation('pages');
  // Holds either an i18n KEY (our own messages) or a raw server message; both
  // resolve through `t` at render — a non-key server string falls back to
  // itself — so the alert tracks live language switches.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const code = params.get('code');
      const state = params.get('state');

      if (!code || !state) {
        setError('oauth.missingParams');
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
        setError('oauth.stateMismatch');
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
        const returnTo = linking ? takeLinkReturnTo() : null;
        navigate(returnTo ?? '/', { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'oauth.failed');
      }
    })();
  }, [navigate, params, provider, signIn, tokenRef]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert role="alert" variant="destructive" className="max-w-md">
          <AlertDescription>{t(error)}</AlertDescription>
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
