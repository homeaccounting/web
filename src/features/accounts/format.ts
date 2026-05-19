import type { AccountResponse, AccountSubtypeKind } from '@/api/types';
import { formatMoney } from '@/lib/format';
import { ACCOUNT_SUBTYPE_LABELS } from './labels';

export function formatAccountBalance(account: AccountResponse): string {
  return formatMoney(account.balance, account.currency);
}

// Falls back to the raw kind for forward-compatibility with new backend
// subtype values that aren't yet in the labels map.
export function formatAccountSubtypeLabel(account: AccountResponse): string {
  if (!account.subtype) return 'Account';
  const kind = account.subtype.type as AccountSubtypeKind;
  return ACCOUNT_SUBTYPE_LABELS[kind] ?? account.subtype.type;
}
