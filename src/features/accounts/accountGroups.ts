import type { AccountResponse, AccountSubtypeType, AssetType } from '@/api/types';
import { ACCOUNT_SUBTYPE_TYPES } from '@/api/types';
import i18n from '@/lib/i18n';
import { accountSubtypeLabel, assetTypeLabel } from './labels';
import { canManage } from './roles';

// A sidebar section of accounts. `key` is either a subtype kind (from
// ACCOUNT_SUBTYPE_TYPES) or one of the synthetic kinds below, and doubles as
// the collapse-toggle identity in the pane.
//
// A group is one of two shapes:
//   - a LEAF: `accounts` holds the rows, `subgroups` is absent;
//   - a PARENT: `subgroups` holds nested sub-sections and `accounts` is []
//     (the pane renders the subgroups, not the empty account list).
// See SECONDARY_GROUPING for when a subtype kind becomes a parent.
export interface AccountGroup {
  key: string;
  label: string;
  accounts: AccountResponse[];
  subgroups?: AccountGroup[];
}

// Synthetic (non-subtype) group kinds — owned accounts with no known subtype,
// and accounts shared with the user. Named constants (keys only) so the pane
// and this module agree on the identities. Labels are resolved at CALL TIME
// (see the helpers below) so they track live language switches.
export const OTHER_GROUP = { key: 'other' } as const;
export const SHARED_GROUP = { key: 'shared' } as const;

// Call-time label resolvers for the synthetic groups. buildAccountGroups runs
// at render (from AccountsPane, which subscribes via useTranslation), so these
// re-resolve on every language change. The defaultValue is the English fallback.
const otherGroupLabel = () => i18n.t('accounts:group.other', { defaultValue: 'Other' });
const sharedGroupLabel = () =>
  i18n.t('accounts:group.sharedWithMe', { defaultValue: 'Shared with me' });

// Per-subtype second-level grouping. A kind listed here splits into nested
// sub-groups keyed by a subtype field (e.g. bank accounts by `bankName`) —
// but only once the section grows past `minCount` AND yields ≥2 distinct
// buckets, so users with a handful of accounts keep the plain flat list.
// Adding a kind is a one-line entry; the mechanism (buildSubgroups) is generic.
interface SecondaryGrouping {
  field: string; // subtype field read as the sub-group key (defensively; see subgroupValue)
  minCount: number; // sub-group only when the section has strictly more than this
  formatValue?: (raw: string) => string; // display label for a value (e.g. enum → human label)
}

// Accounts missing/blank on the grouping field land in the synthetic "Other"
// sub-bucket; its label is resolved at call time in buildSubgroups (not baked
// here) so language switches stay live.
const SECONDARY_GROUPING: Partial<Record<AccountSubtypeType, SecondaryGrouping>> = {
  cash: { field: 'storageLocation', minCount: 5 },
  bankAccount: { field: 'bankName', minCount: 5 },
  eWallet: { field: 'provider', minCount: 5 },
  // assetType is an enum, so its raw value ("property") is shown via its label ("Property").
  asset: {
    field: 'assetType',
    minCount: 5,
    formatValue: (raw) => assetTypeLabel(raw as AssetType),
  },
  loan: { field: 'lender', minCount: 5 },
};

// Sentinel bucket key for accounts with no usable secondary value; kept
// separate from real values so it can always be ordered last.
const FALLBACK_BUCKET = Symbol('fallback');

// Read a secondary grouping value defensively: on AccountResponse the subtype
// is `{ type: string; [k]: unknown }`, so the field may be absent, blank, or
// not a string. Anything that isn't a non-empty string means "no value".
function subgroupValue(account: AccountResponse, field: string): string | null {
  const raw = account.subtype?.[field];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

// Partition `accounts` (all one kind) by their secondary value into nested
// groups: named buckets sorted alphabetically, the fallback bucket last.
// Accounts keep their incoming order within each bucket — the source
// (useAccounts) already sorts by display label, so buckets come out ordered.
function buildSubgroups(
  kind: AccountSubtypeType,
  accounts: AccountResponse[],
  config: SecondaryGrouping,
): AccountGroup[] {
  const buckets = new Map<string | typeof FALLBACK_BUCKET, AccountResponse[]>();
  for (const account of accounts) {
    const value = subgroupValue(account, config.field);
    const bucketKey = value ?? FALLBACK_BUCKET;
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(account);
    else buckets.set(bucketKey, [account]);
  }

  const labelOf = (value: string) => config.formatValue?.(value) ?? value;
  const named = [...buckets.entries()]
    .filter((entry): entry is [string, AccountResponse[]] => typeof entry[0] === 'string')
    .map(([value, group]) => ({ key: `${kind}:${value}`, label: labelOf(value), accounts: group }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const fallback = buckets.get(FALLBACK_BUCKET);
  if (fallback) {
    named.push({ key: `${kind}:__other__`, label: otherGroupLabel(), accounts: fallback });
  }
  return named;
}

// Build one owned subtype section: a flat leaf, unless the kind opts into
// secondary grouping and the section is large enough to warrant sub-groups.
function buildKindGroup(kind: AccountSubtypeType, accounts: AccountResponse[]): AccountGroup {
  const leaf = { key: kind, label: accountSubtypeLabel(kind), accounts };
  const config = SECONDARY_GROUPING[kind];
  if (!config || accounts.length <= config.minCount) return leaf;

  const subgroups = buildSubgroups(kind, accounts, config);
  // A single bucket adds a redundant header — keep it flat in that case.
  return subgroups.length >= 2 ? { key: kind, label: leaf.label, accounts: [], subgroups } : leaf;
}

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
    ...ACCOUNT_SUBTYPE_TYPES.map((kind) =>
      buildKindGroup(
        kind,
        ownedOpenAccounts.filter((a) => a.subtype?.type === kind),
      ),
    ),
    {
      key: OTHER_GROUP.key,
      label: otherGroupLabel(),
      accounts: ownedOpenAccounts.filter(
        (a) => !a.subtype || !ACCOUNT_SUBTYPE_TYPES.includes(a.subtype.type as never),
      ),
    },
  ].filter((g) => g.accounts.length > 0 || (g.subgroups?.length ?? 0) > 0);

  return sharedOpenAccounts.length > 0
    ? [...ownedGroups, { key: SHARED_GROUP.key, label: sharedGroupLabel(), accounts: sharedOpenAccounts }]
    : ownedGroups;
}
