import { describe, expect, it } from 'vitest';
import type { AccountRole } from '@/api/types';
import { ACCOUNT_ROLES } from '@/api/types';
import { GRANTABLE_ROLES, roleLabel, canManage, canModify } from './roles';

describe('canManage', () => {
  it('is true only for owner', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('editor')).toBe(false);
    expect(canManage('viewer')).toBe(false);
  });
});

describe('canModify', () => {
  it('is true for owner and editor, false for viewer', () => {
    expect(canModify('owner')).toBe(true);
    expect(canModify('editor')).toBe(true);
    expect(canModify('viewer')).toBe(false);
  });
});

describe('roleLabel', () => {
  it('has a label for every account role', () => {
    ACCOUNT_ROLES.forEach((role: AccountRole) => {
      expect(roleLabel(role)).toBeTruthy();
    });
    expect(ACCOUNT_ROLES.map(roleLabel)).toEqual(['Owner', 'Editor', 'Viewer']);
  });
});

describe('GRANTABLE_ROLES', () => {
  it('excludes owner', () => {
    expect(GRANTABLE_ROLES).not.toContain('owner');
    expect(GRANTABLE_ROLES).toEqual(['editor', 'viewer']);
  });
});
