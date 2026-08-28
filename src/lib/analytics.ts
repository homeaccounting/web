const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX16 = /^[0-9a-f]{16,}$/i;
const DIGITS = /^\d+$/;

function isIdLike(segment: string): boolean {
  return UUID.test(segment) || DIGITS.test(segment) || HEX16.test(segment);
}

/**
 * Reduce a router pathname to a coarse route pattern safe for analytics:
 * drop the query string entirely and replace id-like segments with `:id`,
 * so account ids, dates, and filters never leave the client.
 */
export function scrubPath(pathname: string): string {
  const path = pathname.split('?')[0] ?? pathname;
  return path
    .split('/')
    .map((segment) => (segment && isIdLike(segment) ? ':id' : segment))
    .join('/');
}

interface GoatCounter {
  count?: (opts: { path: string }) => void;
  no_onload?: boolean;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

const COUNT_JS = 'https://gc.zgo.at/count.js';

// Pageviews requested before count.js has loaded; flushed on its load event.
const pending: string[] = [];

export function isAnalyticsEnabled(): boolean {
  const url = import.meta.env.VITE_GOATCOUNTER_URL;
  if (!url) return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

function flush(): void {
  const count = window.goatcounter?.count;
  if (!count) return;
  let path = pending.shift();
  while (path !== undefined) {
    count({ path });
    path = pending.shift();
  }
}

/** Idempotently install GoatCounter's async counter, suppressing its auto-count. */
export function ensureGoatCounter(): void {
  if (document.querySelector('script[data-goatcounter]')) return;
  const url = import.meta.env.VITE_GOATCOUNTER_URL;
  if (!url) return;
  window.goatcounter = { ...(window.goatcounter ?? {}), no_onload: true };
  const el = document.createElement('script');
  el.async = true;
  el.src = COUNT_JS;
  el.dataset.goatcounter = url;
  el.addEventListener('load', flush);
  document.head.appendChild(el);
}

export function trackPageview(path: string): void {
  if (!isAnalyticsEnabled()) return;
  ensureGoatCounter();
  pending.push(path);
  flush();
}
