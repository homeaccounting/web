import { type Page, expect } from '@playwright/test';

// After registering a fresh user, the app nudges them to /onboarding
// (tracker#58). Specs that aren't testing onboarding itself call this right
// after registration to reach the normal transactions view.
export async function skipOnboarding(page: Page) {
  const skip = page.getByRole('button', { name: /skip for now/i });
  await expect(skip).toBeVisible({ timeout: 20000 });
  await skip.click();
  await expect(page).toHaveURL(/\/transactions/);
}
