import type { AccountResponse, AccountSubtypeType } from '@/api/types';
import { formatMoney } from '@/lib/format';
import { ACCOUNT_SUBTYPE_LABELS } from './labels';

export function formatAccountBalance(account: AccountResponse): string {
  return formatMoney(account.balance, account.currency);
}

// Falls back to the raw type for forward-compatibility with new backend
// subtype values that aren't yet in the labels map.
export function formatAccountSubtypeLabel(account: AccountResponse): string {
  if (!account.subtype) return 'Account';
  const type = account.subtype.type as AccountSubtypeType;
  return ACCOUNT_SUBTYPE_LABELS[type] ?? account.subtype.type;
}
