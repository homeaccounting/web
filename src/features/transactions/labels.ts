export const TRANSACTION_KIND_LABELS = {
  income: {
    title: 'Add income',
    submit: 'OK',
    aria: 'Add income',
    editTitle: 'Edit income',
    editSubmit: 'OK',
  },
  expense: {
    title: 'Add expense',
    submit: 'OK',
    aria: 'Add expense',
    editTitle: 'Edit expense',
    editSubmit: 'OK',
  },
  transfer: {
    title: 'Add transfer',
    submit: 'OK',
    aria: 'Add transfer',
    editTitle: 'Edit transfer',
    editSubmit: 'OK',
  },
} as const;

export type TransactionKind = keyof typeof TRANSACTION_KIND_LABELS;
