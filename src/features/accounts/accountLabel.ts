import type { AccountResponse } from '@/api/types';
import { rawQualifier } from './accountName';

// Locale-aware, case/accent-insensitive string ordering.
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

// Order two accounts deterministically: name, then the raw qualifier
// (bank/provider/lender/storage/asset type; empty sorts first), then currency,
// then id as a final stable tiebreaker so the order never wobbles.
export function compareAccounts(a: AccountResponse, b: AccountResponse): number {
  return (
    byText(a.name, b.name) ||
    byText(rawQualifier(a) ?? '', rawQualifier(b) ?? '') ||
    byText(a.currency, b.currency) ||
    byText(a.id, b.id)
  );
}

// Non-mutating sort. The single ordering used across every account surface
// (pane groups, pickers, reports); see compareAccounts.
export function sortAccounts(accounts: readonly AccountResponse[]): AccountResponse[] {
  return [...accounts].sort(compareAccounts);
}
