import { loadSession, saveSession } from '@/auth/storage';
import type { DemoStore } from './store';

// A demo that opens on a sign-in form is not a demo. The mocked login endpoint
// accepts any credentials, so seeding a session puts the visitor straight
// inside the app. AuthContext hydrates from localStorage when it mounts, so
// this has to run before render — startDemoWorker() is awaited in main.tsx.
//
// Two rules keep this from disturbing the screenshot harness (#62), which
// seeds its own session via addInitScript before the app boots:
//   - never overwrite an existing session, so the harness's identity wins;
//   - take the identity from the seeded corpus rather than a fixture, so the
//     session and the profile the store serves cannot disagree (a profile
//     screenshot showing a different email than the data is the failure mode).
const SESSION_TTL_MS = 3600_000;

export function seedDemoSession(store: DemoStore, now: () => number = Date.now) {
  if (loadSession()) return;
  const profile = store.getProfile();
  saveSession({
    token: 'jwt-demo',
    userId: profile.userId,
    email: profile.email,
    expiresAt: now() + SESSION_TTL_MS,
  });
}
