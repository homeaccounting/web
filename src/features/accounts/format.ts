import type { AccountResponse, AccountSubtypeType } from '@/api/types';
import i18n from '@/lib/i18n';
import { accountSubtypeLabel } from './labels';

// Falls back to the raw type for forward-compatibility with new backend
// subtype values that aren't yet in the labels catalog.
export function formatAccountSubtypeLabel(account: AccountResponse): string {
  if (!account.subtype) return i18n.t('accounts:subtype.unknown', { defaultValue: 'Account' });
  const type = account.subtype.type as AccountSubtypeType;
  return accountSubtypeLabel(type);
}
