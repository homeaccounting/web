import type { AccountResponse } from '@/api/types';
import { useFormat } from '@/lib/useFormat';
import { AccountKindIcon } from './AccountKindIcon';
import { accountNameParts } from './accountName';

// A picker row's body: kind icon, name, qualifier and balance. The qualifier is
// dropped under a sub-header that already shows it (bank, provider, …).
export function AccountOptionContent({
  account,
  showQualifier,
}: {
  account: AccountResponse;
  showQualifier: boolean;
}) {
  const { formatMoney } = useFormat();
  const { qualifier } = accountNameParts(account);
  return (
    <>
      <AccountKindIcon account={account} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="max-w-full shrink-0 truncate">{account.name}</span>
        {showQualifier && qualifier !== null && (
          // Gives way before the name when the row is narrow.
          <span className="min-w-0 truncate text-xs text-muted-foreground">{qualifier}</span>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatMoney(account.balance, account.currency)}
      </span>
    </>
  );
}
