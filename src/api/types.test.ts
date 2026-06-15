import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AccountResponse,
  AccountStatus,
  ChangePasswordRequest,
  ChangeCurrencyRequest,
  AddEntryRequest,
  AddEntryResponse,
  RenameEntryRequest,
} from './types';
import { accountFixture, closedAccountFixture } from '@/test/fixtures';

describe('User Profile DTOs', () => {
  it('ChangePasswordRequest has currentPassword + newPassword', () => {
    expectTypeOf<ChangePasswordRequest>().toEqualTypeOf<{
      currentPassword: string;
      newPassword: string;
    }>();
  });

  it('ChangeCurrencyRequest has currency', () => {
    expectTypeOf<ChangeCurrencyRequest>().toEqualTypeOf<{ currency: string }>();
  });

  it('AddEntryRequest has name', () => {
    expectTypeOf<AddEntryRequest>().toEqualTypeOf<{ name: string }>();
  });

  it('AddEntryResponse has id and name', () => {
    expectTypeOf<AddEntryResponse>().toEqualTypeOf<{ id: string; name: string }>();
  });

  it('RenameEntryRequest has name', () => {
    expectTypeOf<RenameEntryRequest>().toEqualTypeOf<{ name: string }>();
  });
});

describe('AccountResponse status', () => {
  it('exposes an Opened/Closed status field', () => {
    expectTypeOf<AccountResponse['status']>().toEqualTypeOf<AccountStatus>();
    expect(accountFixture.status).toBe('Opened');
    expect(closedAccountFixture.status).toBe('Closed');
  });
});
