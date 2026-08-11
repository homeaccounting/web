import type { AccountResponse } from '@/api/types';
import { formatAccountSubtypeLabel } from '@/features/accounts/format';
import { formatMoney } from '@/lib/format';

export interface AccountHeaderProps {
  account: AccountResponse;
  // Balance figure to display, when it must be gated to stay in step with a
  // slower-settling transaction list (see useConsistentAccountView). Defaults
  // to the account's own (live) balance, matching the previous behaviour.
  balance?: number;
}

export function AccountHeader({ account, balance }: AccountHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <div>
        <h2 className="text-lg font-semibold">{account.name}</h2>
        <div className="text-xs text-muted-foreground">{formatAccountSubtypeLabel(account)}</div>
      </div>
      <span className="text-lg font-medium tabular-nums">
        {formatMoney(balance ?? account.balance, account.currency)}
      </span>
    </div>
  );
}
