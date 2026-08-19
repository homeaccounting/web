import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// tracker#54 — provider-token → contact map on Profile → Banking → Contacts,
// plus create-and-map inline. Runs against a real banking-enabled backend
// (VITE_API_BASE_URL); the dev server is reused.
test.describe('provider-contact map @local', () => {
  test('Contacts sub-tab: create-and-map a token, persists across reload', async ({ page }) => {
    test.setTimeout(60000);
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';
    const token = `MagazinREMONTI-${Date.now()}`;
    const contactName = `Repair Shop ${Date.now()}`;

    // Register a fresh user (empty books, banking enabled by the backend).
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Go straight to the Contacts section of the Banking tab.
    await page.goto('profile/banking?section=contacts');
    await expect(page.getByRole('tab', { name: /contacts/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText(/bank provider token → contact/i)).toBeVisible();
    await expect(page.getByText(/no mappings yet/i)).toBeVisible();

    // Add a row: type the provider token.
    await page.getByRole('button', { name: /add mapping/i }).click();
    await page.getByRole('textbox', { name: /provider token, row 1/i }).fill(token);

    // Create-and-map: type a brand-new contact name into the creatable combobox
    // and activate the "Create '<name>'" row.
    const combobox = page.getByRole('combobox', { name: /contact, row 1/i });
    await combobox.click();
    await combobox.pressSequentially(contactName, { delay: 10 });
    await page.getByRole('option', { name: /create/i }).click();

    // Creation is async (POST entry → config refetch → the combobox resolves the
    // new id to its name). Wait for that to settle before saving, else the row
    // still has no committed contact and Save would validation-fail. Give the
    // real backend round-trip a generous budget.
    await expect(combobox).toHaveValue(contactName, { timeout: 15000 });

    // Save the map.
    await page.getByRole('button', { name: /^save mapping$/i }).click();
    await expect(page.getByText('Updated.')).toBeVisible();

    // Reload and confirm the mapping round-tripped through the backend: the
    // token is still there and now resolves to the created contact by name.
    await page.goto('profile/banking?section=contacts');
    await expect(page.getByRole('textbox', { name: /provider token, row 1/i })).toHaveValue(token);
    await expect(page.getByRole('combobox', { name: /contact, row 1/i })).toHaveValue(contactName);
  });

  test('Banking sub-tabs switch between Connections, Expenses and Contacts', async ({ page }) => {
    test.setTimeout(60000);
    const email = `e2e-${Date.now()}-tabs@example.com`;
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Default section is Connections.
    await page.goto('profile/banking');
    await expect(page.getByRole('button', { name: /add connection/i })).toBeVisible();

    // Contacts tab shows the contact editor, not the connections list.
    await page.getByRole('tab', { name: /contacts/i }).click();
    await expect(page.getByRole('button', { name: /add mapping/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add connection/i })).toBeHidden();

    // Expenses tab shows the category editor.
    await page.getByRole('tab', { name: /expenses/i }).click();
    await expect(page.getByText(/bank provider category → expense category/i)).toBeVisible();
  });
});
