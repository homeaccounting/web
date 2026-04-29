import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse } from '@/api/types';
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
  const setSession = useCallback((next: Session | null) => {
    if (next) saveSession(next);
    else clearSession();
    tokenRef.current = next?.token ?? null;
    setReactSession(next);
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
