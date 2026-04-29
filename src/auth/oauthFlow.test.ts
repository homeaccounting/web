import { describe, expect, it, beforeEach } from 'vitest';
import { saveOAuthState, takeOAuthState, isLinkingFlow, beginLinkFlow } from './oauthFlow';

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
