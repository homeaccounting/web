import { setupWorker } from 'msw/browser';
import { DemoStore } from './store';
import { makeDemoHandlers } from './handlers';
import type { SeedVariant } from './seed';

export async function startDemoWorker() {
  const params = new URLSearchParams(window.location.search);
  const variant = (params.get('seed') as SeedVariant | null) ?? 'populated';
  const store = new DemoStore(variant);
  // Optional ?lang= override so the Playwright harness can capture a given UI
  // language deterministically (after sign-in the app takes its language from
  // server config, not the browser locale).
  const lang = params.get('lang');
  if (lang) store.setLanguage(lang);
  const worker = setupWorker(...makeDemoHandlers(store));
  await worker.start({
    serviceWorker: { url: '/app/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}
