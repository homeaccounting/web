import type { AccountRole } from '@/api/types';

// Roles an owner may grant via the UI. Owner is intentionally excluded — a
// granted owner cannot be revoked. Subset of ACCOUNT_ROLES.
export const GRANTABLE_ROLES = ['editor', 'viewer'] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

// Human-readable labels for each role (badges, selects).
export const ROLE_LABELS: Record<AccountRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

// Capability checks, mirroring backend AuthorizationService:
//   canManage ↔ canManageAccount (Owner only) — share/revoke/close/edit
//   canModify ↔ canModifyAccount (Editor or Owner) — record/transfer/sync
// (canView ↔ canAccessAccount is trivially true for any listed account, so no
//  helper is needed — the account list only contains accessible accounts.)
export const canManage = (role: AccountRole): boolean => role === 'owner';
export const canModify = (role: AccountRole): boolean => role === 'owner' || role === 'editor';
