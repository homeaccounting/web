import { describe, expect, it, beforeEach } from 'vitest';
import { loadSession, saveSession, clearSession, type Session } from './storage';

const sample: Session = {
  token: 'jwt-1',
  userId: 'u-1',
  email: 'a@b.c',
  expiresAt: 1_000_000,
};

describe('auth storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a session', () => {
    saveSession(sample);
    expect(loadSession()).toEqual(sample);
  });

  it('returns null when nothing stored', () => {
    expect(loadSession()).toBeNull();
  });

  it('clears the session', () => {
    saveSession(sample);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('returns null and does not throw on corrupt JSON', () => {
    localStorage.setItem('ha.auth.v1', '{not-json');
    expect(loadSession()).toBeNull();
  });

  it('migrates AuthResponse via fromAuthResponse (expiresIn → expiresAt)', async () => {
    const { fromAuthResponse } = await import('./storage');
    const session = fromAuthResponse(
      { token: 'x', userId: 'u', email: null, expiresIn: 60 },
      () => 1_000_000,
    );
    expect(session).toEqual({ token: 'x', userId: 'u', email: null, expiresAt: 1_060_000 });
  });
});
