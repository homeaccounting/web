import type { AuthResponse } from '@/api/types';

const KEY = 'ha.auth.v1';

export interface Session {
  token: string;
  userId: string;
  email: string | null;
  expiresAt: number; // unix epoch ms
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function fromAuthResponse(res: AuthResponse, now: () => number = Date.now): Session {
  return {
    token: res.token,
    userId: res.userId,
    email: res.email,
    expiresAt: now() + res.expiresIn * 1000,
  };
}
