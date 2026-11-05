import type { AccountResponse, UUID } from '@/api/types';
import { buildAccountGroups } from './accountGroups';
import { accountMatches } from './accountName';

// Small lists stay simple (tracker#97): no search box at or below this count.
export const SEARCH_THRESHOLD = 5;

// A run of rows under one header: a leaf group yields one section, a
// sub-grouped kind one per sub-group (bank, provider, …).
export interface PickerSection {
  key: string;
  subLabel: string | null;
  ariaLabel: string;
  accounts: AccountResponse[];
}

// A top-level group (a kind, "Other", "Shared with me") under one sticky header.
export interface PickerKind {
  key: string;
  label: string;
  sections: PickerSection[];
}

export interface PickerModel {
  kinds: PickerKind[];
  showHeaders: boolean;
  showSearch: boolean;
}

// Reuses the sidebar grouping so pickers and sidebar order accounts the same way.
export function buildPickerModel(accounts: AccountResponse[]): PickerModel {
  const groups = buildAccountGroups(accounts);
  const kinds = groups.map((g) => ({
    key: g.key,
    label: g.label,
    sections: g.subgroups
      ? g.subgroups.map((s) => ({
          key: s.key,
          subLabel: s.label,
          ariaLabel: `${g.label}, ${s.label}`,
          accounts: s.accounts,
        }))
      : [{ key: g.key, subLabel: null, ariaLabel: g.label, accounts: g.accounts }],
  }));
  return {
    kinds,
    // Headers only when grouping tells the user something.
    showHeaders: groups.length >= 2 || groups.some((g) => g.subgroups !== undefined),
    showSearch: accounts.length > SEARCH_THRESHOLD,
  };
}

// Filters inside the structure built from the full list rather than regrouping
// the matches: regrouping would collapse sub-headers once fewer than six rows
// match, so headers would jump while the user types.
export function filterPickerKinds(kinds: PickerKind[], query: string): PickerKind[] {
  if (query.trim() === '') return kinds;
  return kinds
    .map((k) => ({
      ...k,
      sections: k.sections
        .map((s) => ({ ...s, accounts: s.accounts.filter((a) => accountMatches(a, query)) }))
        .filter((s) => s.accounts.length > 0),
    }))
    .filter((k) => k.sections.length > 0);
}

export function pickerAccountIds(kinds: PickerKind[]): UUID[] {
  return kinds.flatMap((k) => k.sections.flatMap((s) => s.accounts.map((a) => a.id)));
}
