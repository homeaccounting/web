import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for the "transactions as canonical, account-scoped by
// URL" feature: /transactions is the single list page, an `accounts=` query
// param drives the scope, "All accounts" shows every account's rows under an
// Account column, a single account hides that column, a multi-account subset
// is selectable via the Filters panel's account chip, and legacy
// /accounts/:id deep links permanently redirect into the new scheme. Runs
// against a live backend (@local). Follows the register/addWallet pattern
// used by e2e/transactions-view-persistence.spec.ts and the add-expense flow
// from e2e/create-transaction.spec.ts.

async function register(page: Page) {
  const email = `e2e-tx-scope-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  const password = 'longenough';
  await page.goto('register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^create account$/i }).click();
  await expect(page.getByText(/no accounts yet/i)).toBeVisible();
}

async function addAccount(page: Page, name: string, balance: string) {
  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill(name);
  await dialog.getByLabel(/initial balance/i).fill(balance);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toBeVisible();
}

// Opens `accountName`, records an expense with `description`, and confirms it
// lands in the table. Mirrors e2e/create-transaction.spec.ts.
async function addExpense(page: Page, accountName: string, description: string) {
  await page.getByRole('link', { name: new RegExp(accountName, 'i') }).click();
  await page.getByRole('button', { name: /^add expense$/i }).click();
  const dialog = page.getByRole('dialog', { name: /add expense/i });
  await dialog.getByLabel(/amount/i).fill('9.99');
  const category = dialog.getByRole('combobox', { name: /category/i });
  await category.click();
  await category.fill('Groc');
  await dialog.getByRole('option', { name: 'Groceries' }).click();
  await dialog.getByLabel(/description/i).fill(description);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(dialog).toBeHidden();
  // Exact match: the row's bulk-select checkbox is labelled "Select <desc>", so
  // a substring match on the description would also hit that cell (strict-mode
  // violation). The description cell's accessible name is exactly the text.
  await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('transactions account scope @local', () => {
  test('all-accounts, single-account, subset, and legacy redirect', async ({ page }) => {
    await register(page);
    await addAccount(page, 'Wallet', '250');
    await addAccount(page, 'Savings', '1000');

    // Record one transaction on each account so the all-accounts view has
    // cross-account rows. Descriptions are deliberately unique and NOT the
    // category name ("Groceries") — else getByRole('cell', …) would match both
    // the description cell and the category chip cell (strict-mode violation).
    await addExpense(page, 'Wallet', 'CoffeeRun');
    await addExpense(page, 'Savings', 'BookStore');

    // --- All-accounts view -------------------------------------------------
    await page.getByRole('link', { name: /all accounts/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    expect(page.url()).not.toContain('accounts=');
    await expect(page.getByRole('columnheader', { name: /account/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'CoffeeRun', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'BookStore', exact: true })).toBeVisible();

    // --- Single-account view ------------------------------------------------
    // The sidebar link's accessible name includes the balance ("Wallet
    // $240.01"), so anchor on the leading word rather than an exact match.
    await page.getByRole('link', { name: /^wallet\b/i }).click();
    await expect(page).toHaveURL(/\/transactions\?accounts=/);
    await expect(page.getByRole('columnheader', { name: /account/i })).toBeHidden();
    await expect(page.getByRole('cell', { name: 'CoffeeRun', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'BookStore', exact: true })).not.toBeVisible();

    // Capture a real Wallet account id from the single-account URL for the
    // legacy-redirect assertion below.
    const walletUrl = new URL(page.url());
    const walletId = walletUrl.searchParams.get('accounts');
    expect(walletId).toBeTruthy();

    // --- Subset via the account filter chip ---------------------------------
    await page.getByRole('link', { name: /all accounts/i }).click();
    await page.getByRole('button', { name: /^filters/i }).click();
    const accountChip = page.getByPlaceholder(/all accounts/i);
    await accountChip.click();
    await page.getByRole('option', { name: /wallet/i }).click();
    await page.getByRole('option', { name: /savings/i }).click();
    // page.url() percent-encodes the CSV separator, so the two ids are joined
    // by "%2C" (not a literal comma).
    await expect(page).toHaveURL(/accounts=[^&]+(?:%2C|,)[^&]+/i);
    await expect(page.getByRole('columnheader', { name: /account/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'CoffeeRun', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'BookStore', exact: true })).toBeVisible();

    // --- Legacy redirect ------------------------------------------------------
    await page.goto(`accounts/${walletId}`);
    await expect(page).toHaveURL(new RegExp(`/transactions\\?accounts=${walletId}`));
  });
});
