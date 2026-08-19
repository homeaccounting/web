import { useCallback, useState } from 'react';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useHasTransactions } from '@/features/transactions/useHasTransactions';
import { useAuth } from '@/auth/useAuth';

const skipKey = (userId: string) => `onboarding:skipped:${userId}`;

// Composes the first-run gate signal (tracker#58). `needsOnboarding` is the
// semantic "brand-new AND unconfigured" test; the sessionStorage skip flag is a
// separate redirect-suppressor layered on top, so a skipped-but-still-empty
// account re-nudges only on a fresh browser session (a new tab / cleared
// sessionStorage), never a persistent localStorage flag or backend change.
export function useOnboardingStatus() {
  const { session } = useAuth();
  const config = useConfiguration();
  const hasTx = useHasTransactions();
  const userId = session?.userId ?? '';

  const [skipped, setSkipped] = useState(() =>
    userId ? sessionStorage.getItem(skipKey(userId)) === '1' : false,
  );
  const skip = useCallback(() => {
    if (userId) sessionStorage.setItem(skipKey(userId), '1');
    setSkipped(true);
  }, [userId]);

  const isPending = config.isPending || hasTx.isPending;
  const needsOnboarding =
    !isPending && !skipped && config.data?.country == null && hasTx.data === false;

  return { needsOnboarding, isPending, skip };
}
