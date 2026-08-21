import type { AccountRole } from '@/api/types';
import i18n from '@/lib/i18n';

// Roles an owner may grant via the UI. Owner is intentionally excluded — a
// granted owner cannot be revoked. Subset of ACCOUNT_ROLES.
export const GRANTABLE_ROLES = ['editor', 'viewer'] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

// Human-readable label for a role (badges, selects), resolved from the
// `accounts` i18n namespace at CALL TIME so it tracks live language switches.
// The defaultValue falls back to the raw role for forward-compatibility.
export function roleLabel(role: AccountRole): string {
  return i18n.t(`accounts:role.${role}`, { defaultValue: role });
}

// Capability checks, mirroring backend AuthorizationService:
//   canManage ↔ canManageAccount (Owner only) — share/revoke/close/edit
//   canModify ↔ canModifyAccount (Editor or Owner) — record/transfer/sync
// (canView ↔ canAccessAccount is trivially true for any listed account, so no
//  helper is needed — the account list only contains accessible accounts.)
export const canManage = (role: AccountRole): boolean => role === 'owner';
export const canModify = (role: AccountRole): boolean => role === 'owner' || role === 'editor';
