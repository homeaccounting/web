import { test, expect } from './fixtures';
import { enterDemo } from '../support/demo';

// Hero flow: first-run onboarding — pick a country, then land on the app.
test('onboarding', async ({ page }) => {
  await enterDemo(page, { seed: 'fresh', freezeClock: false, path: '/onboarding' });
  const country = page.getByRole('combobox', { name: 'Country' });
  await expect(country).toBeVisible();
  await country.click();
  await page.getByRole('option').first().click();
  // Selecting a country writes the onboarding flag; wait for it to settle so the
  // gate lets /transactions render instead of redirecting back here.
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/transactions/);
  await page.waitForTimeout(800);
});
