import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// Localization smoke (tracker#56 / #35). Runs against a real backend (@local).
// Proves the UI language switches LIVE from the persisted `language` signal with
// NO page reload: a fresh (English) user switches to Ukrainian in Profile and a
// stable chrome label flips to its Ukrainian catalog value, then flips back to
// English — all without a full navigation.
test.describe('localization language switch @local', () => {
  test('switching language re-renders the UI live, no reload, and reverts', async ({ page }) => {
    test.setTimeout(120000);
    const email = `e2e-i18n-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register a fresh user (defaults to English) and reach the app.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Open Profile → General (default tab), in English.
    await page.getByRole('button', { name: /open user menu/i }).click();
    await page.getByRole('menuitem', { name: /profile/i }).click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();

    // Marker to detect a full page reload: a real reload wipes window state.
    await page.evaluate(() => {
      (window as unknown as { __noReload?: boolean }).__noReload = true;
    });

    // Switch Language → Ukrainian. The option display names come from the
    // (deliberately non-localized) localization-options list, so the option is
    // still labelled "Ukrainian" regardless of the current UI language.
    await page.getByRole('combobox', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Ukrainian' }).click();

    // LIVE re-render: the "General" tab now shows its Ukrainian catalog value
    // (profile:tabs.general = "Загальні"). No reload, same route.
    await expect(page.getByRole('tab', { name: 'Загальні' })).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/profile/);
    const survivedFirstSwitch = await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload === true,
    );
    expect(survivedFirstSwitch).toBe(true);

    // Switch back to English. The Language field's accessible name is now the
    // Ukrainian label ("Мова"); the option is still "English".
    await page.getByRole('combobox', { name: 'Мова' }).click();
    await page.getByRole('option', { name: 'English' }).click();

    // Reverts live to English.
    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible({ timeout: 20000 });
    const survivedSecondSwitch = await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload === true,
    );
    expect(survivedSecondSwitch).toBe(true);
  });
});

// A Ukrainian-browser user gets the UI (and the onboarding language default)
// derived from the browser's Accept-Language before any explicit choice.
test.describe('browser-language onboarding default @local', () => {
  test.use({ locale: 'uk-UA' });

  test('a uk-browser fresh user sees Ukrainian onboarding + seeded language', async ({ page }) => {
    test.setTimeout(120000);
    const email = `e2e-i18n-uk-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register — the pre-auth screen already renders in Ukrainian (uk labels).
    await page.goto('register');
    await page.getByLabel(/пошта/i).fill(email);
    await page.getByLabel(/пароль/i).fill(password);
    await page.getByRole('button', { name: /створити обліковий запис/i }).click();

    // Onboarding renders in Ukrainian (title "Налаштуймо основи"), and the
    // language was seeded from the browser → the Language field shows Ukrainian.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20000 });
    await expect(page.getByText('Налаштуймо основи')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('combobox', { name: 'Мова' })).toContainText('Ukrainian', {
      timeout: 20000,
    });
  });
});
