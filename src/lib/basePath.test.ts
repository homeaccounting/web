import { describe, it, expect } from 'vitest';
import { routerBasename, assetUrl } from './basePath';

describe('routerBasename', () => {
  it('strips the trailing slash for the app build', () => {
    expect(routerBasename('/app/')).toBe('/app');
  });

  it('keeps root as "/" rather than an empty basename', () => {
    expect(routerBasename('/')).toBe('/');
  });
});

describe('assetUrl', () => {
  it('resolves under the app base', () => {
    expect(assetUrl('mockServiceWorker.js', '/app/')).toBe('/app/mockServiceWorker.js');
  });

  it('resolves at the root for the published demo', () => {
    expect(assetUrl('mockServiceWorker.js', '/')).toBe('/mockServiceWorker.js');
  });

  it('tolerates a base without a trailing slash', () => {
    expect(assetUrl('mockServiceWorker.js', '/app')).toBe('/app/mockServiceWorker.js');
  });
});
