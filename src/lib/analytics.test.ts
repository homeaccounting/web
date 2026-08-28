import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scrubPath } from './analytics';

describe('scrubPath', () => {
  it('leaves a plain route untouched', () => {
    expect(scrubPath('/transactions')).toBe('/transactions');
  });

  it('drops the query string (account ids, dates, filters)', () => {
    expect(scrubPath('/transactions?account=abc&from=2026-01-01')).toBe('/transactions');
  });

  it('replaces a UUID segment with :id', () => {
    expect(scrubPath('/accounts/9f3e2a10-1c4b-4e2a-9b7d-2f5a6c8e1d00/edit')).toBe(
      '/accounts/:id/edit',
    );
  });

  it('replaces an all-digits segment with :id', () => {
    expect(scrubPath('/accounts/12345')).toBe('/accounts/:id');
  });

  it('replaces a long hex (dashless) id with :id', () => {
    expect(scrubPath('/x/9f3e2a101c4b4e2a9b7d2f5a6c8e1d00')).toBe('/x/:id');
  });

  it('preserves known enum tabs that are not id-like', () => {
    expect(scrubPath('/profile/defaults')).toBe('/profile/defaults');
  });

  it('scrubs multiple id segments in one path', () => {
    expect(scrubPath('/a/12345/b/67890')).toBe('/a/:id/b/:id');
  });
});

describe('analytics runtime', () => {
  // Re-import per test so the module-level pageview queue is fresh.
  let mod: typeof import('./analytics');

  beforeEach(async () => {
    vi.resetModules();
    document.head.innerHTML = '';
    delete (window as unknown as { goatcounter?: unknown }).goatcounter;
    window.location.href = 'https://app.example.test/app/';
    vi.stubEnv('VITE_GOATCOUNTER_URL', 'https://x.goatcounter.com/count');
    mod = await import('./analytics');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isAnalyticsEnabled is true when the var is set and host is not localhost', () => {
    expect(mod.isAnalyticsEnabled()).toBe(true);
  });

  it('isAnalyticsEnabled is false when the var is unset', () => {
    vi.stubEnv('VITE_GOATCOUNTER_URL', '');
    expect(mod.isAnalyticsEnabled()).toBe(false);
  });

  it('isAnalyticsEnabled is false on localhost even when the var is set', () => {
    window.location.href = 'http://localhost/app/';
    expect(mod.isAnalyticsEnabled()).toBe(false);
  });

  it('ensureGoatCounter injects the count.js script exactly once', () => {
    mod.ensureGoatCounter();
    mod.ensureGoatCounter();
    const scripts = document.querySelectorAll('script[data-goatcounter]');
    expect(scripts).toHaveLength(1);
    const el = scripts[0] as HTMLScriptElement;
    expect(el.src).toBe('https://gc.zgo.at/count.js');
    expect(el.dataset.goatcounter).toBe('https://x.goatcounter.com/count');
    expect(window.goatcounter?.no_onload).toBe(true);
  });

  it('trackPageview counts immediately when count.js is already loaded', () => {
    const count = vi.fn();
    (window as unknown as { goatcounter: { count: typeof count } }).goatcounter = { count };
    mod.trackPageview('/transactions');
    expect(count).toHaveBeenCalledWith({ path: '/transactions' });
  });

  it('trackPageview queues before load and flushes on the script load event', () => {
    mod.trackPageview('/transactions'); // no count() yet -> queued
    const count = vi.fn();
    const el = document.querySelector('script[data-goatcounter]') as HTMLScriptElement;
    (window as unknown as { goatcounter: { count: typeof count } }).goatcounter = { count };
    el.dispatchEvent(new Event('load'));
    expect(count).toHaveBeenCalledWith({ path: '/transactions' });
  });

  it('isAnalyticsEnabled is false on the IPv6 loopback host', () => {
    window.location.href = 'http://[::1]/app/';
    expect(mod.isAnalyticsEnabled()).toBe(false);
  });

  it('trackPageview is a no-op (no script, no count) when the var is unset', () => {
    vi.stubEnv('VITE_GOATCOUNTER_URL', '');
    const count = vi.fn();
    (window as unknown as { goatcounter: { count: typeof count } }).goatcounter = { count };
    mod.trackPageview('/transactions');
    expect(count).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-goatcounter]')).toBeNull();
  });

  it('drops queued pageviews when count.js fails to load (bounded queue)', () => {
    mod.trackPageview('/transactions'); // queued; count.js not loaded
    const el = document.querySelector('script[data-goatcounter]') as HTMLScriptElement;
    el.dispatchEvent(new Event('error'));
    // After failure, a later load event must not replay the dropped pageview.
    const count = vi.fn();
    (window as unknown as { goatcounter: { count: typeof count } }).goatcounter = { count };
    el.dispatchEvent(new Event('load'));
    expect(count).not.toHaveBeenCalled();
  });
});
