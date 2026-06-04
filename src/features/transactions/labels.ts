export const TRANSACTION_KIND_LABELS = {
  income: {
    title: 'Add income',
    submit: 'Add income',
    aria: 'Add income',
    editTitle: 'Edit income',
    editSubmit: 'Save',
  },
  expense: {
    title: 'Add expense',
    submit: 'Add expense',
    aria: 'Add expense',
    editTitle: 'Edit expense',
    editSubmit: 'Save',
  },
  transfer: {
    title: 'Add transfer',
    submit: 'Add transfer',
    aria: 'Add transfer',
    editTitle: 'Edit transfer',
    editSubmit: 'Save',
  },
} as const;

export type TransactionKind = keyof typeof TRANSACTION_KIND_LABELS;
