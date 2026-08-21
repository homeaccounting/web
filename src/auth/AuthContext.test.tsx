import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import { saveSession } from './storage';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext', () => {
  beforeEach(() => localStorage.clear());

  it('starts unauthenticated', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.session).toBeNull();
  });

  it('hydrates from localStorage on mount', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.session?.token).toBe('t');
  });

  it('signIn stores the session and triggers re-render', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.signIn({ token: 't', userId: 'u', email: null, expiresIn: 60 });
    });
    expect(result.current.session?.token).toBe('t');
  });

  it('signOut clears the session', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.signIn({ token: 't', userId: 'u', email: null, expiresIn: 60 }));
    act(() => result.current.signOut());
    expect(result.current.session).toBeNull();
  });

  it('clears the query cache on sign in and sign out (no cross-user cache bleed)', () => {
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.signIn({ token: 't', userId: 'u', email: null, expiresIn: 60 }));
    expect(clearSpy).toHaveBeenCalledTimes(1);
    act(() => result.current.signOut());
    expect(clearSpy).toHaveBeenCalledTimes(2);
    clearSpy.mockRestore();
  });
});
