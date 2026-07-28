import { test, expect } from '@playwright/test';
import { format, subMonths } from 'date-fns';

// The sticky default-date feature: after submitting a transaction dated to a
// specific (here: past) day, reopening a create dialog defaults to that day
// instead of snapping back to today. Session-scoped (sessionStorage).
test.describe('sticky transaction date @local', () => {
  test('reopened Add expense defaults to the last-used (past) day', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // A deterministic past day: the 15th of last month (always exists, always past).
    const pastDay = subMonths(new Date(), 1);
    pastDay.setDate(15);
    const pastLabel = format(pastDay, 'PPP'); // e.g. "June 15th, 2026"
    const pastDataDay = format(pastDay, 'yyyy-MM-dd'); // calendar cell key

    // Register + create an account.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await page.getByRole('button', { name: /add account/i }).click();
    const acctDialog = page.getByRole('dialog');
    await acctDialog.getByLabel(/name/i).fill('Wallet');
    await acctDialog.getByLabel(/initial balance/i).fill('100');
    await acctDialog.getByRole('button', { name: /^ok$/i }).click();

    await page.getByRole('link', { name: /wallet/i }).click();

    // First Add expense: date defaults to today, then change it to the past day.
    // Scope to the expense dialog by name — the date-picker popover also has
    // role="dialog", so a bare getByRole('dialog') is ambiguous.
    await page.getByRole('button', { name: /^add expense$/i }).click();
    let dialog = page.getByRole('dialog', { name: /add expense/i });
    await dialog.getByLabel(/amount/i).fill('9.99');
    const category = dialog.getByRole('combobox', { name: /category/i });
    await category.click();
    await category.fill('Groc');
    await dialog.getByRole('option', { name: 'Groceries' }).click();
    await dialog.getByLabel(/description/i).fill('Coffee');

    // Open the date picker and pick the 15th of last month.
    await dialog.getByLabel(/date/i).click();
    await page.getByRole('button', { name: /previous/i }).click();
    await page.locator(`td[data-day="${pastDataDay}"] button`).click();
    // The date trigger now reflects the past day.
    await expect(dialog.getByLabel(/date/i)).toContainText(pastLabel);
    // Dismiss the calendar popover, then submit. A successful submit closes the
    // dialog (the row may fall outside the default "last month..today" window,
    // so we key success off the dialog closing rather than a visible row).
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(dialog).toBeHidden();

    // Reopen Add expense — WITHOUT touching the date — and confirm it defaults
    // to the past day we last used, not today.
    await page.getByRole('button', { name: /^add expense$/i }).click();
    dialog = page.getByRole('dialog', { name: /add expense/i });
    await expect(dialog.getByLabel(/date/i)).toContainText(pastLabel);
  });
});
