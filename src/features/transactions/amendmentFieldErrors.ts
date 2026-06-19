// Maps backend amend/allocation field names to the matching form field. Shared
// by EditTransactionDialog and ConvertTransactionDialog (both submit `amend`).

export function mapIncomeExpenseFieldError(
  field: string,
  kind: 'income' | 'expense',
): string | null {
  switch (field) {
    case 'description':
      return 'description';
    case 'at':
      return 'date';
    case 'labels':
      return 'labels';
    case 'sourceCurrency':
    case 'targetCurrency':
    case 'exchangeRate':
      return 'amount';
    // The total (sourceAmount/targetAmount) and the allocation buckets
    // (newAllocations/allocations) no longer correspond to a single form field —
    // the amount lives on each slice row and there is no top-level `category`
    // field. There is no per-row path to target from a bucket-level backend
    // error, so surface these on the dialog's error banner instead (the mapper
    // returns null and the dialog falls back to the banner).
    case 'sourceAmount':
    case 'targetAmount':
    case 'newAllocations':
    case 'allocations':
      return null;
    case 'sourceAccountId':
      return kind === 'expense' ? 'accountId' : null;
    case 'targetAccountId':
      return kind === 'income' ? 'accountId' : null;
    default:
      return null;
  }
}

export function mapTransferFieldError(field: string): string | null {
  switch (field) {
    case 'description':
      return 'description';
    case 'at':
      return 'date';
    case 'labels':
      return 'labels';
    case 'sourceAmount':
    case 'targetAmount':
    case 'sourceCurrency':
    case 'targetCurrency':
      return 'amount';
    case 'exchangeRate':
      return 'exchangeRate';
    case 'sourceAccountId':
      return 'sourceAccountId';
    case 'targetAccountId':
      return 'targetAccountId';
    default:
      return null;
  }
}
