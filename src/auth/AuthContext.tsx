import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse } from '@/api/types';
import { queryClient } from '@/lib/queryClient';
import { clearSession, fromAuthResponse, loadSession, saveSession, type Session } from './storage';

export interface AuthContextValue {
  session: Session | null;
  signIn: (auth: AuthResponse) => void;
  signOut: () => void;
  tokenRef: { readonly current: string | null };
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setReactSession] = useState<Session | null>(() => loadSession());
  const tokenRef = useRef<string | null>(session?.token ?? null);

  // Single source of truth for any session change: localStorage + tokenRef + state
  // are all updated together so a child fetch firing in the same commit always sees
  // the new token (TanStack Query's queryFn runs synchronously in mount effects).
  //
  // Clearing the query cache on every session change is essential: the read
  // queries (['configuration'], ['transactions','any'], …) are keyed by concern,
  // NOT by user, so without a clear the previous user's cached data (e.g. their
  // country / "has transactions") would bleed into the next user in the same
  // browser — most visibly making the onboarding gate skip a brand-new user.
  const setSession = useCallback((next: Session | null) => {
    if (next) saveSession(next);
    else clearSession();
    tokenRef.current = next?.token ?? null;
    setReactSession(next);
    queryClient.clear();
  }, []);

  const signIn = useCallback(
    (auth: AuthResponse) => setSession(fromAuthResponse(auth)),
    [setSession],
  );

  const signOut = useCallback(() => setSession(null), [setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut, tokenRef }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
