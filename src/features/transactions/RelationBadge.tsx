import { Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { roundMoney } from '@/lib/money';
import type { RelationStat } from './relationIndex';

// Shared muted-chip styling, matching the row's other inline chips.
const CHIP = 'ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium';

// Only the 'refund' and 'associated' kinds are representable here; merge/split
// relations are structural and are never surfaced with an unlink affordance
// (enforced by the prop type, which never accepts those kinds).
type RelationBadgeProps = (
  | {
      // The expense side: this transaction has been (partially or fully) refunded.
      kind: 'refund';
      mode: 'origin';
      refundStat: RelationStat;
      originalTotal: number;
      currency: string;
    }
  | {
      // The income side: this transaction is itself a refund of an earlier one.
      // `description` is undefined when the counterpart isn't in the window.
      kind: 'refund';
      mode: 'counterpart';
      description?: string;
    }
  | {
      // A free-form association to another transaction.
      // `description` is undefined when the counterpart isn't in the window;
      // `counterpartCancelled` appends a " (cancelled)" marker.
      kind: 'associated';
      mode: 'counterpart';
      description?: string;
      counterpartCancelled?: boolean;
    }
) & {
  // When provided, renders an unlink icon-button that invokes this callback.
  // The parent performs the actual removal (wired in W7).
  onUnlink?: () => void;
};

function badgeText(props: RelationBadgeProps): string {
  if (props.kind === 'refund' && props.mode === 'origin') {
    // Full when the refunded total meets or exceeds the original at cent precision
    // (no bespoke epsilon — roundMoney is the codebase's money-equality primitive).
    const full = roundMoney(props.refundStat.total) >= roundMoney(props.originalTotal);
    return full
      ? 'refunded in full'
      : `partially refunded (${formatMoney(props.refundStat.total, props.currency)} of ${formatMoney(
          props.originalTotal,
          props.currency,
        )})`;
  }

  if (props.kind === 'refund') {
    return props.description ? `refund of ${props.description}` : 'refund';
  }

  // associated / counterpart
  const base = props.description ? `associated with ${props.description}` : 'associated';
  return props.counterpartCancelled ? `${base} (cancelled)` : base;
}

/**
 * Presentational, kind-aware relation indicator shown on transaction rows.
 * Covers refund pairings (origin + counterpart) and free-form associations, and
 * optionally renders an unlink control for removable kinds. All data (aggregate
 * stats, resolved descriptions, cancellation flag) is computed by the parent —
 * this component only renders. Supersedes RefundBadge (refund output is
 * pixel-identical).
 */
export function RelationBadge(props: RelationBadgeProps) {
  const text = badgeText(props);
  return (
    <span className={cn(CHIP, 'text-muted-foreground')}>
      {text}
      {props.onUnlink && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Unlink"
          className="-mr-1 ml-1 h-4 w-4"
          onClick={(e) => {
            e.stopPropagation();
            props.onUnlink?.();
          }}
        >
          <Link2Off className="h-3 w-3" />
        </Button>
      )}
    </span>
  );
}
