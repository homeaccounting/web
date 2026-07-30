import type { AccountResponse, TransactionResponse, UUID } from '@/api/types';
import { isAdjustment, isIncome, isTransfer } from './transactionType';

// Account scope is carried in the `accounts` URL query param and is the single
// source of truth for which accounts the transactions list shows. Absent param
// = all accounts; a csv of ids = that subset (a single id is a one-element set).
export type AccountScope = { kind: 'all' } | { kind: 'accounts'; ids: UUID[] };

const ALL: AccountScope = { kind: 'all' };

function dedupe(ids: UUID[]): UUID[] {
  return [...new Set(ids)];
}

// Parse the `accounts` param into a scope. `accounts` is the loaded account
// list; pass `undefined` while it is still loading so a valid subset is not
// transiently emptied to "all" — unknown-id filtering only runs once loaded.
export function parseAccountScope(
  params: URLSearchParams,
  accounts: AccountResponse[] | undefined,
): AccountScope {
  const raw = params.get('accounts');
  if (!raw) return ALL;
  const ids = dedupe(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (ids.length === 0) return ALL;
  if (!accounts) return { kind: 'accounts', ids };
  const known = new Set(accounts.map((a) => a.id));
  const filtered = ids.filter((id) => known.has(id));
  return filtered.length ? { kind: 'accounts', ids: filtered } : ALL;
}

// The `accounts` param value for a scope, or null when the param should be
// omitted entirely (all accounts).
export function scopeToParam(scope: AccountScope): string | null {
  return scope.kind === 'all' ? null : scope.ids.join(',');
}

// Set (or clear) the `accounts` param on a copy of `params`, preserving every
// other param (period/from/to). Overrides any existing value — it does not
// merge into the current subset.
export function withAccountScope(params: URLSearchParams, scope: AccountScope): URLSearchParams {
  const next = new URLSearchParams(params);
  const value = scopeToParam(scope);
  if (value) next.set('accounts', value);
  else next.delete('accounts');
  return next;
}

// The sole account id when exactly one account is scoped, else null. Drives the
// single-account behaviours (per-account header/balance, create prefill,
// Quick add visibility).
export function isSingleAccount(scope: AccountScope): UUID | null {
  return scope.kind === 'accounts' && scope.ids.length === 1 ? scope.ids[0]! : null;
}

// True when more than one account can appear in the list (all, or a 2+ subset)
// — the condition for showing the Account column and the multi-account header.
export function scopeSpansMultiple(scope: AccountScope): boolean {
  return scope.kind === 'all' || scope.ids.length > 1;
}

// The account ids a transaction touches: income → its target, expense → its
// source, transfer/adjustment → both legs. (Moved from TransactionsPane; the
// subset filter and cache-patch derivation share this one definition.)
export function accountsOf(t: TransactionResponse): UUID[] {
  if (isTransfer(t.transactionType) || isAdjustment(t.transactionType)) {
    return [t.sourceAccountId, t.targetAccountId];
  }
  return [isIncome(t.transactionType) ? t.targetAccountId : t.sourceAccountId];
}

// Whether a transaction belongs in the current scope (always true for all).
export function transactionInScope(t: TransactionResponse, scope: AccountScope): boolean {
  if (scope.kind === 'all') return true;
  const ids = new Set(scope.ids);
  return accountsOf(t).some((id) => ids.has(id));
}
