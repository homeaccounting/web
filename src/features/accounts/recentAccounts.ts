import type { UUID } from '@/api/types';

// Accounts recently used per create form (tracker#103), kept per device. A
// backend "last used per kind" can replace this if cross-device matters.
export const RECENT_ACCOUNTS_KEY = 'ha.accounts.recent';

// Transfer source and target are tracked apart: the accounts money leaves
// from are rarely the ones it goes to.
export type RecentAccountKind = 'expense' | 'income' | 'transferSource' | 'transferTarget';

const LIMIT = 3;

type Store = Partial<Record<RecentAccountKind, UUID[]>>;

// A blocked or corrupt store reads as empty, so the picker shows no Recent group.
function readStore(): Store {
  try {
    const o = JSON.parse(localStorage.getItem(RECENT_ACCOUNTS_KEY) ?? '{}') as unknown;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function readRecentAccounts(kind: RecentAccountKind): UUID[] {
  const ids = readStore()[kind];
  return Array.isArray(ids) ? ids.filter((x): x is UUID => typeof x === 'string') : [];
}

export function recordRecentAccount(kind: RecentAccountKind, id: UUID): void {
  const ids = [id, ...readRecentAccounts(kind).filter((x) => x !== id)].slice(0, LIMIT);
  try {
    localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify({ ...readStore(), [kind]: ids }));
  } catch {
    // Best effort: without storage the picker just has no Recent group.
  }
}

// The Recent group's ids: the profile default first, then this form's recent
// accounts. The picker drops any it doesn't offer.
export function recentAccountIds(kind: RecentAccountKind, defaultId?: UUID | null): UUID[] {
  const recent = readRecentAccounts(kind);
  return defaultId ? [defaultId, ...recent.filter((x) => x !== defaultId)] : recent;
}
