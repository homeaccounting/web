import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveOAuthState,
  takeOAuthState,
  isLinkingFlow,
  beginLinkFlow,
  takeLinkReturnTo,
} from './oauthFlow';

describe('oauthFlow', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips state and clears after take', () => {
    saveOAuthState('abc');
    expect(takeOAuthState()).toBe('abc');
    expect(takeOAuthState()).toBeNull();
  });

  it('reports linking flow only when explicitly begun', () => {
    expect(isLinkingFlow()).toBe(false);
    beginLinkFlow();
    expect(isLinkingFlow()).toBe(true);
  });

  it('clears linking flag when state is taken', () => {
    beginLinkFlow();
    saveOAuthState('abc');
    expect(takeOAuthState()).toBe('abc');
    expect(isLinkingFlow()).toBe(false);
  });
});

describe('beginLinkFlow returnTo', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips a returnTo path via session storage', () => {
    beginLinkFlow({ returnTo: '/profile/auth' });
    // takeOAuthState() is called first in the real flow; mirror that.
    sessionStorage.setItem('ha.oauth.state', 'state-abc');
    void takeOAuthState();
    expect(takeLinkReturnTo()).toBe('/profile/auth');
    // second read returns null
    expect(takeLinkReturnTo()).toBeNull();
  });

  it('returns null when beginLinkFlow was called without returnTo', () => {
    beginLinkFlow();
    expect(takeLinkReturnTo()).toBeNull();
  });
});
