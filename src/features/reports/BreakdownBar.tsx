export interface BreakdownBarProps {
  label: string;
  amount: string;
  fraction: number; // 0..1 of the largest row
}

export function BreakdownBar({ label, amount, fraction }: BreakdownBarProps) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="ml-2 shrink-0 tabular-nums">{amount}</span>
      </div>
      <div className="h-2 w-full rounded bg-muted" aria-hidden>
        <div
          data-testid="breakdown-bar-fill"
          className="h-2 rounded bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
