// Client-side marker that the user has EXPLICITLY chosen a UI language (via a
// language selector), as opposed to the server default or an auto-seeded
// browser default. It lets LanguageSync know it may apply the server `language`
// signal even when it equals the default (`en`) for a user who has no country
// set yet — without it, a fresh user's browser-detected boot language would be
// clobbered by the untouched default. localStorage-backed so the choice
// survives reloads; failures (private mode, disabled storage) degrade to "not
// chosen", which is safe.
const KEY = 'ha:languageChosen';

export function markLanguageChosen(): void {
  try {
    localStorage.setItem(KEY, 'true');
  } catch {
    // storage unavailable — treated as "not chosen"; acceptable.
  }
}

export function hasChosenLanguage(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}
