export const TRANSACTION_KIND_LABELS = {
  income: {
    title: 'Add income',
    submit: 'OK',
    aria: 'Add income',
    editTitle: 'Edit income',
    editSubmit: 'OK',
    copyTitle: 'Copy income',
  },
  expense: {
    title: 'Add expense',
    submit: 'OK',
    aria: 'Add expense',
    editTitle: 'Edit expense',
    editSubmit: 'OK',
    copyTitle: 'Copy expense',
  },
  transfer: {
    title: 'Add transfer',
    submit: 'OK',
    aria: 'Add transfer',
    editTitle: 'Edit transfer',
    editSubmit: 'OK',
    copyTitle: 'Copy transfer',
  },
} as const;

export type TransactionKind = keyof typeof TRANSACTION_KIND_LABELS;
