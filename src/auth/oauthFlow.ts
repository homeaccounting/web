const STATE_KEY = 'ha.oauth.state';
const LINKING_KEY = 'ha.oauth.linking';

export function saveOAuthState(state: string): void {
  sessionStorage.setItem(STATE_KEY, state);
}

export function takeOAuthState(): string | null {
  const v = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(LINKING_KEY);
  return v;
}

export function beginLinkFlow(): void {
  sessionStorage.setItem(LINKING_KEY, '1');
}

export function isLinkingFlow(): boolean {
  return sessionStorage.getItem(LINKING_KEY) === '1';
}

// React StrictMode double-fires effects in dev (and a user could land on the
// callback URL twice via back/refresh). The OAuth code-for-token exchange is
// one-shot — Google rejects a second use of the same code — so we dedupe on
// the OAuth `state` value. sessionStorage backing keeps the marker alive across
// the StrictMode unmount-remount and is naturally scoped to the browser tab.
const PROCESSED_KEY_PREFIX = 'ha.oauth.processed.';

export function markOAuthStateProcessed(state: string): void {
  sessionStorage.setItem(PROCESSED_KEY_PREFIX + state, '1');
}

export function isOAuthStateProcessed(state: string): boolean {
  return sessionStorage.getItem(PROCESSED_KEY_PREFIX + state) !== null;
}
