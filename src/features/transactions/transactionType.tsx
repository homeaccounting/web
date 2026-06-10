import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Circle,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import type { TransferTypeText } from '@/api/types';

export interface TransactionTypeMeta {
  Icon: LucideIcon;
  colorClass: string;
  label: string;
}

// Maps the backend `transactionType` discriminator to a leading icon + color
// for the list row. Unknown values (the open `(string & {})` arm of
// TransferTypeText) fall back to a neutral dot labelled with the raw value.
export function transactionTypeMeta(type: TransferTypeText): TransactionTypeMeta {
  switch (type) {
    case 'income':
      return {
        Icon: ArrowDownToLine,
        colorClass: 'text-green-600 dark:text-green-400',
        label: 'Income',
      };
    case 'expense':
      return { Icon: ArrowUpFromLine, colorClass: 'text-destructive', label: 'Expense' };
    case 'transfer':
      return {
        Icon: ArrowLeftRight,
        colorClass: 'text-blue-600 dark:text-blue-400',
        label: 'Transfer',
      };
    case 'adjustment':
      return { Icon: Scale, colorClass: 'text-muted-foreground', label: 'Adjustment' };
    default:
      return { Icon: Circle, colorClass: 'text-muted-foreground', label: type || 'Unknown' };
  }
}
