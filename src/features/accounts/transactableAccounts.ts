import type { AccountResponse, UUID } from '@/api/types';
import { canModify } from './roles';

export const canRecordOn = (account: AccountResponse): boolean =>
  account.status === 'Opened' && canModify(account.role);

// `keepIds` keeps accounts that are already selected, e.g. an edited
// transaction's account that has since been closed, so the picker can still
// show it until the user picks another.
export function transactableAccounts(
  accounts: AccountResponse[],
  keepIds: readonly string[] = [],
): AccountResponse[] {
  return accounts.filter((a) => canRecordOn(a) || keepIds.includes(a.id));
}

// The account a new transaction starts on: the preferred (scoped) account when
// eligible, otherwise the first eligible one.
export function defaultRecordAccount(
  accounts: AccountResponse[],
  preferredId?: UUID,
  excludeId?: UUID,
): AccountResponse | undefined {
  const eligible = accounts.filter((a) => canRecordOn(a) && a.id !== excludeId);
  return eligible.find((a) => a.id === preferredId) ?? eligible[0];
}
