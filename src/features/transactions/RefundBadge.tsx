import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useFormat } from '@/lib/useFormat';
import { roundMoney } from '@/lib/money';
import type { RefundStat } from './refundIndex';

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
  const { t } = useTranslation('transactions');
  const { formatMoney } = useFormat();
  if (props.mode === 'refund') {
    const text = props.originalDescription
      ? t('resolve.refundOf', { description: props.originalDescription })
      : t('resolve.refund');
    return (
      <Badge variant="muted" className="ml-2">
        {text}
      </Badge>
    );
  }

  // Full when the refunded total meets or exceeds the original at cent precision
  // (no bespoke epsilon — roundMoney is the codebase's money-equality primitive).
  const full = roundMoney(props.refundStat.total) >= roundMoney(props.originalTotal);
  const text = full
    ? t('resolve.refundedInFull')
    : t('resolve.partiallyRefunded', {
        refunded: formatMoney(props.refundStat.total, props.currency),
        original: formatMoney(props.originalTotal, props.currency),
      });
  return (
    <Badge variant="muted" className="ml-2">
      {text}
    </Badge>
  );
}
