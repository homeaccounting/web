import { test, expect } from '@playwright/test';

// Smoke test for the country/language settings + country-aware provider
// consumption feature (tracker#47). Runs against a real backend (@local).
// Also guards the two reported no-reload regressions:
//   1) changing country must update the Default currency in place (preset cascade)
//   2) changing country must re-group the provider pickers in place
test.describe('country/language + provider scoping @local', () => {
  test('country/language persist and cascade + regroup providers without reload', async ({
    page,
  }) => {
    // Local backend round-trips through the browser have been observed taking
    // several seconds; give generous headroom (mirrors profile.spec.ts).
    test.setTimeout(120000);
    const email = `e2e-clp-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register a fresh user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Profile → General (default tab).
    await page.getByRole('button', { name: /open user menu/i }).click();
    await page.getByRole('menuitem', { name: /profile/i }).click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('tab', { name: /general/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const countryCombo = page.getByRole('combobox', { name: 'Country' });
    const languageCombo = page.getByRole('combobox', { name: 'Language' });
    const defaultCurrency = page.getByRole('combobox', { name: 'Default currency' });
    const bankingTab = page.getByRole('tab', { name: /banking/i });
    const bankingEnabled = await bankingTab.isVisible().catch(() => false);

    // Set Country = United States first (fresh user default currency is USD, so
    // no visible currency change yet — this sets the baseline for the regroup check).
    await countryCombo.click();
    await page.getByRole('option', { name: 'United States' }).click();
    await expect(countryCombo).toContainText('United States', { timeout: 20000 });

    // Regression #2 (baseline): as a US user, the UA-only providers must appear
    // under an "Other countries" group in the connect picker.
    if (bankingEnabled) {
      await bankingTab.click();
      await page.getByRole('button', { name: /add connection/i }).click();
      await page.getByRole('combobox', { name: 'Provider' }).click();
      await expect(page.getByText('Other countries')).toBeVisible({ timeout: 20000 });
      // Close the select + dialog.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: /general/i }).click();
    }

    // Switch Country = Ukraine. The regional preset cascades the default currency
    // to UAH — and the Default currency select must reflect it WITHOUT a reload
    // (regression #1).
    await countryCombo.click();
    await page.getByRole('option', { name: 'Ukraine' }).click();
    await expect(countryCombo).toContainText('Ukraine', { timeout: 20000 });
    await expect(defaultCurrency).toContainText('UAH', { timeout: 20000 });

    // Regression #2 (after change): now a UA user, the same providers must be
    // in-country — the "Other countries" group must be GONE without a reload.
    if (bankingEnabled) {
      await bankingTab.click();
      await page.getByRole('button', { name: /add connection/i }).click();
      await page.getByRole('combobox', { name: 'Provider' }).click();
      // A UA provider is present and no out-of-country group is shown.
      await expect(page.getByRole('option', { name: /monobank/i })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Other countries')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: /general/i }).click();
    }

    // Set Language = Ukrainian and confirm it survives a reload alongside country.
    await languageCombo.click();
    await page.getByRole('option', { name: 'Ukrainian' }).click();
    await expect(languageCombo).toContainText('Ukrainian', { timeout: 20000 });

    await page.reload();
    await page.getByRole('button', { name: /open user menu/i }).click();
    await page.getByRole('menuitem', { name: /profile/i }).click();
    await expect(page.getByRole('combobox', { name: 'Country' })).toContainText('Ukraine', {
      timeout: 20000,
    });
    await expect(page.getByRole('combobox', { name: 'Language' })).toContainText('Ukrainian');
  });
});
