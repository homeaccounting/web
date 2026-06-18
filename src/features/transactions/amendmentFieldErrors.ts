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
    case 'sourceAmount':
    case 'targetAmount':
    case 'sourceCurrency':
    case 'targetCurrency':
    case 'exchangeRate':
      return 'amount';
    case 'newAllocations':
    case 'allocations':
      return 'category';
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
