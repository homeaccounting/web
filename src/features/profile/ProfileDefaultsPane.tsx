import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useAccounts } from '@/features/accounts/useAccounts';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DefaultCategoriesCard } from './DefaultCategoriesCard';
import { DefaultAccountsCard } from './DefaultAccountsCard';

export function ProfileDefaultsPane() {
  const config = useConfiguration();
  const accounts = useAccounts();

  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>Failed to load configuration.</AlertDescription>
      </Alert>
    );
  }
  const c = config.data;
  return (
    <div className="space-y-6">
      <DefaultCategoriesCard
        incomeCurrent={c.defaults.incomeCategory}
        expenseCurrent={c.defaults.expenseCategory}
        incomeCategories={c.dictionaries['income-category']?.entries ?? []}
        expenseCategories={c.dictionaries['expense-category']?.entries ?? []}
      />
      <DefaultAccountsCard
        accounts={accounts.data ?? []}
        accountCurrent={c.defaults.account}
        subtypeCurrent={c.defaults.subtypeAccounts}
      />
    </div>
  );
}
