import i18n from '@/lib/i18n';

// The three editable transaction kinds. Kept as a value so consumers can key
// display strings and iterate; the display strings themselves live in the
// `transactions` i18n catalog (kind.<kind>.<slot>) and resolve at CALL TIME.
export const TRANSACTION_KINDS = ['income', 'expense', 'transfer'] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

// The per-kind display slots. Preserved exactly from the former
// TRANSACTION_KIND_LABELS const so no call site loses a string.
export type TransactionKindSlot =
  | 'title'
  | 'submit'
  | 'aria'
  | 'editTitle'
  | 'editSubmit'
  | 'copyTitle'
  | 'convertTitle';

// Resolve a kind's display string at call time against the current language.
// Non-hook callers use this directly; components re-render on language change
// via their own useTranslation subscription, so the read here stays fresh.
export function transactionKindLabel(kind: TransactionKind, slot: TransactionKindSlot): string {
  return i18n.t(`transactions:kind.${kind}.${slot}`);
}
