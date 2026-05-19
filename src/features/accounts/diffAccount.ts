import type { AccountSubtypeRequest } from '@/api/types';
import type { EditAccountFormValues } from './schema';

export interface AccountEditDiff {
  name?: string;
  // null = clear the overdraft limit (send body without overdraftLimit field).
  // undefined = no change.
  overdraftLimit?: number | null;
  subtype?: AccountSubtypeRequest;
}

export function diffAccount(
  initial: EditAccountFormValues,
  next: EditAccountFormValues,
): AccountEditDiff {
  if (initial.currency !== next.currency) {
    throw new Error(
      `diffAccount: currency cannot change in edit mode (got ${initial.currency} → ${next.currency})`,
    );
  }
  const diff: AccountEditDiff = {};
  if (next.name !== initial.name) diff.name = next.name;
  if ((initial.overdraftLimit ?? null) !== (next.overdraftLimit ?? null)) {
    diff.overdraftLimit = next.overdraftLimit ?? null;
  }
  if (!subtypeEqual(initial.subtype, next.subtype)) {
    diff.subtype = next.subtype;
  }
  return diff;
}

export function subtypeEqual(
  a: EditAccountFormValues['subtype'],
  b: EditAccountFormValues['subtype'],
): boolean {
  if (a.type !== b.type) return false;
  const ar = a as unknown as Record<string, unknown>;
  const br = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(ar), ...Object.keys(br)]);
  const norm = (v: unknown) => (v === '' ? undefined : v);
  for (const k of keys) {
    if (k === 'type') continue;
    if (norm(ar[k]) !== norm(br[k])) return false;
  }
  return true;
}
