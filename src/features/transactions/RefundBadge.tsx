import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { roundMoney } from '@/lib/money';
import type { RefundStat } from './refundIndex';

// Shared muted-chip styling, matching the row's other inline chips.
const CHIP = 'ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium';

type RefundBadgeProps =
  | {
      // The expense side: this transaction has been (partially or fully) refunded.
      mode: 'origin';
      refundStat: RefundStat;
      originalTotal: number;
      currency: string;
    }
  | {
      // The income side: this transaction is itself a refund of an earlier one.
      // `originalDescription` is undefined when the original isn't in the window.
      mode: 'refund';
      originalDescription?: string;
    };

/**
 * Presentational linkage badge shown on both sides of a refund pairing. All
 * data (the aggregate stat, original total/currency, resolved description) is
 * computed by the parent — this component only renders.
 */
export function RefundBadge(props: RefundBadgeProps) {
  if (props.mode === 'refund') {
    const text = props.originalDescription ? `refund of ${props.originalDescription}` : 'refund';
    return <span className={cn(CHIP, 'text-muted-foreground')}>{text}</span>;
  }

  // Full when the refunded total meets or exceeds the original at cent precision
  // (no bespoke epsilon — roundMoney is the codebase's money-equality primitive).
  const full = roundMoney(props.refundStat.total) >= roundMoney(props.originalTotal);
  const text = full
    ? 'refunded in full'
    : `partially refunded (${formatMoney(props.refundStat.total, props.currency)} of ${formatMoney(
        props.originalTotal,
        props.currency,
      )})`;
  return <span className={cn(CHIP, 'text-muted-foreground')}>{text}</span>;
}
