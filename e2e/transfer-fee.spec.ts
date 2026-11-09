import { test, expect, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';
import { uniqueEmail } from './support/email';

// tracker#104: a transfer can carry fees. Runs against a live backend (@local) so
// the booked amounts prove the client sends the debit (amount + fee on top) and
// the fee allocation the backend balances against the credited amount.

async function addAccount(page: Page, name: string, balance: string) {
  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill(name);
  await dialog.getByLabel(/initial balance/i).fill(balance);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toBeVisible();
}

type Booked = { sourceAmount: number; targetAmount: number; allocations: { expenses: unknown[] } };

test.describe('transfer fee @local', () => {
  test('books a fee on top, then switches it to deducted on edit', async ({ page }) => {
    await page.goto('register');
    await page.getByLabel(/email/i).fill(uniqueEmail('e2e-fee'));
    await page.getByLabel(/password/i).fill('longenough');
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await addAccount(page, 'Checking', '1000');
    await addAccount(page, 'Savings', '0');

    await page.getByRole('button', { name: /^add transfer$/i }).click();
    const dialog = page.getByRole('dialog', { name: /add transfer/i });
    await dialog.getByRole('combobox', { name: /source account/i }).click();
    await page.getByRole('option', { name: /checking/i }).click();
    await dialog.getByRole('combobox', { name: /target account/i }).click();
    await page.getByRole('option', { name: /savings/i }).click();
    await dialog
      .getByRole('spinbutton', { name: /^amount/i })
      .first()
      .fill('100');
    await dialog.getByLabel(/description/i).fill('Fee transfer');

    await dialog.getByRole('switch', { name: /add fee/i }).click();
    const category = dialog.getByRole('combobox', { name: /^category$/i });
    await category.click();
    await category.fill('Taxes');
    await dialog.getByRole('option', { name: /taxes & fees/i }).click();
    await dialog
      .getByRole('spinbutton', { name: /^amount/i })
      .nth(1)
      .fill('1.5');
    await expect(dialog.getByTestId('transfer-fee-summary')).toContainText(
      /Debited.*101\.50.*Received.*100\.00.*Fee.*1\.50/,
    );
    await dialog.screenshot({ path: 'test-results/transfer-fee-create.png' });

    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/transactions/transfer') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    const booked = (await (await created).json()) as Booked;
    expect(booked).toMatchObject({ sourceAmount: 101.5, targetAmount: 100 });
    expect(booked.allocations.expenses).toHaveLength(1);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('link', { name: /checking/i })).toContainText(/898\.50/);

    // Edit: the fee section is open; deducting the fee keeps the debit at 100.
    await page.getByRole('link', { name: /checking/i }).click();
    await page.getByText('Fee transfer').dblclick();
    const edit = page.getByRole('dialog', { name: /edit transfer/i });
    await expect(edit.getByRole('switch', { name: /add fee/i })).toBeChecked();
    await edit.getByRole('radio', { name: /target/i }).click();
    await edit
      .getByRole('spinbutton', { name: /^amount/i })
      .first()
      .fill('100');
    await expect(edit.getByTestId('transfer-fee-summary')).toContainText(
      /Debited.*100\.00.*Received.*98\.50/,
    );
    const amended = page.waitForResponse(
      (r) => r.url().endsWith('/amendment') && r.request().method() === 'PUT',
    );
    await edit.getByRole('button', { name: /^ok$/i }).click();
    const after = (await (await amended).json()) as Booked;
    expect(after).toMatchObject({ sourceAmount: 100, targetAmount: 98.5 });
    expect(after.allocations.expenses).toHaveLength(1);
    await expect(edit).toBeHidden();
    await expect(page.getByText(/incl\. fee \$1\.50/)).toBeVisible();
  });
});
