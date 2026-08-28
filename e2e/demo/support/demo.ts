import { type Page } from '@playwright/test';
import { AS_OF } from '../../../src/demo/seed';

// localStorage key + seeded identity must match src/auth/storage.ts (Session
// shape) and the corpus profile (src/demo/seed/corpus.ts). Any well-shaped
// session logs the user in — the demo mock returns the profile regardless of
// these values — but we mirror the corpus identity for consistency.
const SESSION_KEY = 'ha.auth.v1';
const DEMO_USER_ID = '00000000-0000-0000-0000-00000000d001';
const DEMO_EMAIL = 'demo@example.com';

/**
 * Put the page into the seeded, signed-in demo state with a frozen clock, then
 * navigate to the app. No backend required — the MSW browser worker (VITE_DEMO)
 * serves the seed corpus.
 */
export async function enterDemo(
  page: Page,
  opts: {
    seed?: 'populated' | 'fresh';
    language?: string;
    path?: string;
    // Screenshots freeze the clock for pixel determinism; clips leave it live so
    // faked timers don't stall interaction-driven flows (debounces, loaders).
    freezeClock?: boolean;
  } = {},
) {
  const seed = opts.seed ?? 'populated';
  if (opts.freezeClock ?? true) {
    // Freeze the clock to the corpus as-of date so form date-defaults and report
    // windows are stable across runs.
    await page.clock.install({ time: new Date(AS_OF) });
  }
  // Seed a signed-in session on the /app/ origin BEFORE the app boots.
  await page.addInitScript(
    (args: { key: string; userId: string; email: string; asOf: string }) => {
      const session = {
        token: 'jwt-demo',
        userId: args.userId,
        email: args.email,
        expiresAt: new Date(args.asOf).getTime() + 3600_000,
      };
      window.localStorage.setItem(args.key, JSON.stringify(session));
    },
    { key: SESSION_KEY, userId: DEMO_USER_ID, email: DEMO_EMAIL, asOf: AS_OF },
  );
  // The demo bootstrap (src/demo/browser.ts) reads ?seed= and ?lang= on every
  // full page load, so they must ride on whatever path we navigate to.
  const path = opts.path ?? '/';
  const [pathname, existingQuery] = path.split('?');
  const query = new URLSearchParams(existingQuery);
  query.set('seed', seed);
  if (opts.language) query.set('lang', opts.language);
  await page.goto(`/app${pathname}?${query.toString()}`);
}

/** Remove motion + wait for fonts/network so screenshots are pixel-stable. */
export async function stabilize(page: Page) {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  // The frozen clock (page.clock) also fakes requestAnimationFrame, so JS-driven
  // chart animations (Recharts) never progress in real time. Advance the fake
  // clock to run them to their final, static state before capturing.
  await page.clock.runFor(2000);
}
