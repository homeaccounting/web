export const TRANSACTION_KIND_LABELS = {
  income: { title: 'Add income', submit: 'Add income', aria: 'Add income' },
  expense: { title: 'Add expense', submit: 'Add expense', aria: 'Add expense' },
  transfer: { title: 'Add transfer', submit: 'Add transfer', aria: 'Add transfer' },
} as const;

export type TransactionKind = keyof typeof TRANSACTION_KIND_LABELS;
