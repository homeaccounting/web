import type { AccountResponse, AccountSubtypeType } from '@/api/types';

// A display label for an account, split so callers can render the qualifier
// with its own (muted) styling. `qualifier` is null when the bare name already
// identifies the account.
export interface AccountLabelParts {
  name: string;
  qualifier: string | null;
}

// The identifying subtype field per kind — the institution-like value that
// tells the user WHICH account a name refers to. Asset is intentionally absent:
// `assetType` is a category (a grouping key), not an identity, so assets are
// never qualified by it (see accountLabelParts).
const QUALIFIER_FIELD: Partial<Record<AccountSubtypeType, string>> = {
  cash: 'storageLocation',
  bankAccount: 'bankName',
  eWallet: 'provider',
  loan: 'lender',
};

// The identifying qualifier for an account, read defensively — on
// AccountResponse the subtype is `{ type: string; [k]: unknown }`, so the field
// may be absent, blank, or not a string. Returns null when there's no usable
// value, or the kind isn't qualified (e.g. asset).
function qualifierOf(account: AccountResponse): string | null {
  const field = account.subtype && QUALIFIER_FIELD[account.subtype.type as AccountSubtypeType];
  if (!field) return null;
  const raw = account.subtype?.[field];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

// Two accounts that share this key are indistinguishable by name + qualifier
// alone, so a currency tiebreaker is needed. Name is compared trimmed & lowercased.
function collisionKey(account: AccountResponse): string {
  return `${account.name.trim().toLowerCase()} | ${qualifierOf(account) ?? ''}`;
}

export interface AccountLabelOptions {
  // When false, the currency tiebreaker is never appended — for callers that
  // already render the currency separately (e.g. transaction forms show
  // "name (currency)"), so the qualifier carries only the identifying field.
  currencyTiebreaker?: boolean;
}

// Build an identifying label for `account` shown in a FLAT list (`siblings`,
// which includes `account`). The goal is identification, not string dedup: an
// account always shows its identifying field (bank/provider/lender/storage),
// because a unique name like "card" still doesn't tell the user which one it
// is. Currency is appended only when name + qualifier still collide with
// another sibling. Assets are the exception — they have no identifying field,
// so an asset shows the bare name (currency only on a collision).
//
// Not for grouped sub-sections — there the qualifier is already the sub-header,
// so those rows render the bare name.
export function accountLabelParts(
  account: AccountResponse,
  siblings: readonly AccountResponse[],
  options: AccountLabelOptions = {},
): AccountLabelParts {
  const { currencyTiebreaker = true } = options;
  const qualifier = qualifierOf(account);
  const key = collisionKey(account);
  const collides = siblings.some((s) => s.id !== account.id && collisionKey(s) === key);

  const qualifiers: string[] = [];
  if (qualifier) qualifiers.push(qualifier);
  if (currencyTiebreaker && collides) qualifiers.push(account.currency);

  return { name: account.name, qualifier: qualifiers.length > 0 ? qualifiers.join(' · ') : null };
}

// Single-string form for single-line surfaces (e.g. account pickers) that can't
// style the qualifier separately.
export function accountLabel(account: AccountResponse, siblings: readonly AccountResponse[]): string {
  const { name, qualifier } = accountLabelParts(account, siblings);
  return qualifier ? `${name} · ${qualifier}` : name;
}
