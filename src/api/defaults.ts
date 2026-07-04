import {
  SUBTYPE_TYPE_TO_KIND,
  type AccountSubtypeType,
  type AccountSubtypeKind,
  type AccountResponse,
} from '@/api/types';

const TYPE_BY_KIND = Object.fromEntries(
  Object.entries(SUBTYPE_TYPE_TO_KIND).map(([type, kind]) => [kind, type]),
) as Record<string, AccountSubtypeType>;

/** Discriminator type (cash, …) → backend map-key kind (CashKind, …). */
export function subtypeTypeToKind(type: AccountSubtypeType): AccountSubtypeKind {
  return SUBTYPE_TYPE_TO_KIND[type];
}

/** Backend map-key kind (CashKind, …) → discriminator type (cash, …).
 *  Returns undefined for unknown keys so a future backend subtype is ignored, not fatal. */
export function subtypeKindToType(kind: string): AccountSubtypeType | undefined {
  return TYPE_BY_KIND[kind];
}

/** Accounts eligible to be a default: Regular (has a subtype) and Opened. */
export function isSelectableDefaultAccount(a: AccountResponse): boolean {
  return a.status === 'Opened' && a.subtype != null;
}
