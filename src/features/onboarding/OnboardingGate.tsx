import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnboardingStatus } from './useOnboardingStatus';

// Wraps the app's landing-surface routes (/ and /transactions). Until the gate
// signal resolves we must render NEITHER the app nor a redirect: rendering the
// app while pending and then redirecting once the signal lands is the
// flash-then-redirect bug (a brand-new user briefly sees the transactions page
// before being yanked to onboarding). So hold on a neutral loader while pending,
// then decide. Does NOT wrap /onboarding itself, so there is no redirect loop.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { needsOnboarding, isPending } = useOnboardingStatus();
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  if (isPending) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        role="status"
        aria-label="Loading"
      >
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }
  return <>{children}</>;
}
