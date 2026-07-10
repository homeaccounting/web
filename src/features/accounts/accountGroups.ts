import type { AccountResponse } from '@/api/types';
import { ACCOUNT_SUBTYPE_TYPES } from '@/api/types';
import { ACCOUNT_SUBTYPE_LABELS } from './labels';
import { canManage } from './roles';

// A sidebar section of accounts. `key` is either a subtype kind (from
// ACCOUNT_SUBTYPE_TYPES) or one of the synthetic kinds below, and doubles as
// the collapse-toggle identity in the pane.
export interface AccountGroup {
  key: string;
  label: string;
  accounts: AccountResponse[];
}

// Synthetic (non-subtype) group kinds — owned accounts with no known subtype,
// and accounts shared with the user. Named constants rather than inline magic
// strings so the pane and this module agree on the keys/labels.
export const OTHER_GROUP = { key: 'other', label: 'Other' } as const;
export const SHARED_GROUP = { key: 'shared', label: 'Shared with me' } as const;

// Build the sidebar's OPEN-account groups:
//   - owned accounts (role: owner) grouped by subtype in canonical order,
//     with unknown/absent subtypes collected into the synthetic "Other" group;
//   - a trailing synthetic "Shared with me" group for accounts shared with the
//     user (editor/viewer), only when any exist.
// Empty groups are omitted. Closed accounts are handled separately by the pane.
export function buildAccountGroups(openAccounts: AccountResponse[]): AccountGroup[] {
  const ownedOpenAccounts = openAccounts.filter((a) => canManage(a.role));
  const sharedOpenAccounts = openAccounts.filter((a) => !canManage(a.role));

  const ownedGroups: AccountGroup[] = [
    ...ACCOUNT_SUBTYPE_TYPES.map((kind) => ({
      key: kind,
      label: ACCOUNT_SUBTYPE_LABELS[kind],
      accounts: ownedOpenAccounts.filter((a) => a.subtype?.type === kind),
    })),
    {
      key: OTHER_GROUP.key,
      label: OTHER_GROUP.label,
      accounts: ownedOpenAccounts.filter(
        (a) => !a.subtype || !ACCOUNT_SUBTYPE_TYPES.includes(a.subtype.type as never),
      ),
    },
  ].filter((g) => g.accounts.length > 0);

  return sharedOpenAccounts.length > 0
    ? [...ownedGroups, { ...SHARED_GROUP, accounts: sharedOpenAccounts }]
    : ownedGroups;
}
