import type { AccountResponse } from '@/api/types';
import { formatAccountBalance, formatAccountSubtypeLabel } from '@/features/accounts/format';

export interface AccountHeaderProps {
  account: AccountResponse;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <div>
        <h2 className="text-lg font-semibold">{account.name}</h2>
        <div className="text-xs text-muted-foreground">{formatAccountSubtypeLabel(account)}</div>
      </div>
      <span className="text-lg font-medium tabular-nums">{formatAccountBalance(account)}</span>
    </div>
  );
}
