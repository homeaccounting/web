import { describe, it, expect, beforeEach } from 'vitest';
import { loadSession, saveSession } from '@/auth/storage';
import { DemoStore } from './store';
import { seedDemoSession } from './session';

describe('seedDemoSession', () => {
  beforeEach(() => localStorage.clear());

  it('signs the visitor in as the seeded corpus user', () => {
    const store = new DemoStore('populated');
    seedDemoSession(store, () => 1_000);

    const session = loadSession();
    const profile = store.getProfile();
    expect(session?.userId).toBe(profile.userId);
    expect(session?.email).toBe(profile.email);
    expect(session?.expiresAt).toBeGreaterThan(1_000);
  });

  // The screenshot harness (#62) seeds its own session before the app boots.
  // Overwriting it would swap the identity under the captures.
  it('leaves an existing session alone', () => {
    const existing = {
      token: 'harness',
      userId: 'harness-user',
      email: 'harness@example.com',
      expiresAt: 9_999_999,
    };
    saveSession(existing);

    seedDemoSession(new DemoStore('populated'));

    expect(loadSession()).toEqual(existing);
  });
});
