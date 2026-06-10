import { cn } from '@/lib/utils';
import type { TransferTypeText } from '@/api/types';
import { transactionTypeMeta } from './transactionType';

export function TransactionTypeIcon({
  type,
  className,
}: {
  type: TransferTypeText;
  className?: string;
}) {
  const { Icon, colorClass, label } = transactionTypeMeta(type);
  return (
    <span role="img" aria-label={label} className={cn('inline-flex', colorClass, className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
