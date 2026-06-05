import { describe, it, expectTypeOf } from 'vitest';
import type {
  ChangePasswordRequest,
  ChangeCurrencyRequest,
  AddEntryRequest,
  AddEntryResponse,
  RenameEntryRequest,
} from './types';

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
