import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// Smoke test for the country/language settings + country-aware provider
// consumption feature (tracker#47). Runs against a real backend (@local).
// Guards the two reported no-reload regressions:
//   1) changing country must update the Default currency in place (preset cascade)
//   2) changing country must re-group the provider pickers in place
//
// NOTE (tracker#56 / #35): the UI now localizes LIVE. The UA preset cascades
// language → Ukrainian, so from the moment Country=Ukraine is chosen the whole
// UI renders in Ukrainian. Selectors after that point therefore use the
// Ukrainian catalog labels. Provider option *names* (monobank) and the
// language/country option *names* (Ukraine/Ukrainian) are deliberately NOT
// localized, so they stay in their canonical form regardless of UI language.
test.describe('country/language + provider scoping @local', () => {
  test('country/language persist and cascade + regroup providers without reload', async ({
    page,
  }) => {
    // Local backend round-trips through the browser have been observed taking
    // several seconds; give generous headroom (mirrors profile.spec.ts).
    test.setTimeout(120000);
    const email = `e2e-clp-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register a fresh user (English default).
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Profile → General (default tab), still English.
    await page.getByRole('button', { name: /open user menu/i }).click();
    await page.getByRole('menuitem', { name: /profile/i }).click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const bankingEnabled = await page
      .getByRole('tab', { name: /banking/i })
      .isVisible()
      .catch(() => false);

    // Set Country = United States first. The US preset keeps language English
    // (US = {English, USD}), so the UI stays in English for this baseline.
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'United States' }).click();
    await expect(page.getByRole('combobox', { name: 'Country' })).toContainText('United States', {
      timeout: 20000,
    });

    // Regression #2 (baseline): as a US user, the UA-only providers must appear
    // under an "Other countries" group in the connect picker.
    if (bankingEnabled) {
      await page.getByRole('tab', { name: /banking/i }).click();
      await page.getByRole('button', { name: /add connection/i }).click();
      await page.getByRole('combobox', { name: 'Provider' }).click();
      await expect(page.getByText('Other countries')).toBeVisible({ timeout: 20000 });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // Wait for the connect dialog to fully close so its overlay stops
      // intercepting pointer events before returning to the General tab.
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20000 });
      await page.getByRole('tab', { name: /general/i }).click();
    }

    // Switch Country = Ukraine. The regional preset cascades the default currency
    // to UAH AND the language to Ukrainian — both must reflect WITHOUT a reload.
    // From here the UI is Ukrainian, so selectors switch to the uk catalog labels.
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'Ukraine' }).click();

    // Regression #1: Default currency cascades to UAH in place. The field label
    // is now Ukrainian ("Валюта за замовчуванням").
    await expect(page.getByRole('combobox', { name: 'Валюта за замовчуванням' })).toContainText(
      'UAH',
      { timeout: 20000 },
    );
    // Language cascaded to Ukrainian in place: the language field shows "Ukrainian"
    // (option name is not localized) and the General tab now reads "Загальні".
    await expect(page.getByRole('tab', { name: 'Загальні' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('combobox', { name: 'Мова' })).toContainText('Ukrainian');

    // Regression #2 (after change): now a UA user, the same providers must be
    // in-country — the "Other countries" group ("Інші країни") must be GONE
    // without a reload. Banking chrome is now Ukrainian.
    if (bankingEnabled) {
      await page.getByRole('tab', { name: 'Банк' }).click();
      await page.getByRole('button', { name: /додати підключення/i }).click();
      await page.getByRole('combobox', { name: 'Провайдер' }).click();
      await expect(page.getByRole('option', { name: /monobank/i })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Інші країни')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20000 });
      await page.getByRole('tab', { name: 'Загальні' }).click();
    }

    // Country + language persist across a reload (UI stays Ukrainian after it).
    await page.reload();
    await page.getByRole('button', { name: 'Відкрити меню користувача' }).click();
    await page.getByRole('menuitem', { name: 'Профіль' }).click();
    await expect(page.getByRole('combobox', { name: 'Країна' })).toContainText('Ukraine', {
      timeout: 20000,
    });
    await expect(page.getByRole('combobox', { name: 'Мова' })).toContainText('Ukrainian');
  });
});
