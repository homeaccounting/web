import type { AccountResponse } from '@/api/types';
import type { AccountScope } from './accountScope';
import { accountLabel } from '@/features/accounts/accountLabel';

// The multi-account counterpart to AccountHeader: a heading identifying the
// current scope ("All accounts" or "{n} accounts") without a balance, since a
// multi-account/all view has no single account balance to show. Mirrors
// AccountHeader's wrapper/heading styling so the two headers read consistently.
export function ScopeHeader({
  scope,
  accounts,
}: {
  scope: AccountScope;
  accounts: AccountResponse[];
}) {
  const labels =
    scope.kind === 'all'
      ? []
      : scope.ids
          .map((id) => accounts.find((a) => a.id === id))
          .filter((a): a is AccountResponse => !!a)
          .map((a) => accountLabel(a, accounts));
  const title = scope.kind === 'all' ? 'All accounts' : `${scope.ids.length} accounts`;
  return (
    <div className="border-b px-4 py-2.5">
      <h2 className="text-lg font-semibold" title={labels.join(', ') || undefined}>
        {title}
      </h2>
    </div>
  );
}
