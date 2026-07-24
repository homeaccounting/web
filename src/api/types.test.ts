import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AccountResponse,
  AccountStatus,
  ChangePasswordRequest,
  ChangeCurrencyRequest,
  AddEntryRequest,
  AddEntryResponse,
  RenameEntryRequest,
  AmendTransactionRequest,
  ExpenseRequest,
  SetTransactionContactRequest,
  TransactionResponse,
} from './types';
import { accountFixture, closedAccountFixture, transactionFixture } from '@/test/fixtures';

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

  it('AddEntryRequest has name, role and optional parentId', () => {
    expectTypeOf<AddEntryRequest>().toEqualTypeOf<{
      name: string;
      type: 'group' | 'item';
      parentId?: string | null;
    }>();
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

describe('Transaction contact DTOs', () => {
  it('TransactionResponse carries a required contactId (id-only, nullable)', () => {
    expectTypeOf<TransactionResponse['contactId']>().toEqualTypeOf<string | null>();
    expect(transactionFixture.contactId).toBeNull();
  });

  it('ExpenseRequest accepts an optional nullable contactId', () => {
    const withContact: ExpenseRequest = {
      accountId: 'a1',
      currency: 'USD',
      allocations: { incomes: [], expenses: [] },
      description: '',
      contactId: 'contact-1',
    };
    const cleared: ExpenseRequest = {
      accountId: 'a1',
      currency: 'USD',
      allocations: { incomes: [], expenses: [] },
      description: '',
      contactId: null,
    };
    expect(withContact.contactId).toBe('contact-1');
    expect(cleared.contactId).toBeNull();
  });

  it('AmendTransactionRequest accepts an optional nullable contactId', () => {
    expectTypeOf<AmendTransactionRequest['contactId']>().toEqualTypeOf<string | null | undefined>();
  });

  it('SetTransactionContactRequest carries a required nullable contactId', () => {
    expectTypeOf<SetTransactionContactRequest>().toEqualTypeOf<{ contactId: string | null }>();
  });
});
