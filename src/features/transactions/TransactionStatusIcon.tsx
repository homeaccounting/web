import { Ban, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TransactionStatusText } from '@/api/types';

// Non-Completed statuses surface as a small icon in the row's leading meta
// cell (next to the type icon) — deliberately NOT a chip, so status never
// reads as a label. Completed (the norm) renders nothing. The display label is
// resolved at render from the `transactions` catalog (status.<status>).
const STATUS_ICON: Record<string, { Icon: LucideIcon; className: string } | undefined> = {
  Pending: { Icon: Clock, className: 'text-warning' },
  Failed: { Icon: TriangleAlert, className: 'text-destructive' },
  Cancelled: { Icon: Ban, className: 'text-muted-foreground' },
};

export function TransactionStatusIcon({
  status,
  failureReason,
}: {
  status: TransactionStatusText;
  failureReason?: string | null;
}) {
  const { t } = useTranslation('transactions');
  const meta = STATUS_ICON[status];
  if (!meta) return null; // Completed (and unknown) → nothing
  const { Icon, className } = meta;
  const label = t(`status.${status}`);
  const title = status === 'Failed' && failureReason ? `${label}: ${failureReason}` : label;
  return (
    <span role="img" aria-label={label} title={title} className={cn('inline-flex', className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
