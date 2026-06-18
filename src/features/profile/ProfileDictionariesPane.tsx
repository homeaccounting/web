import { useConfiguration } from '@/features/configuration/useConfiguration';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DictionaryList } from './DictionaryList';
import { DefaultCategoryField } from './DefaultCategoryField';

export function ProfileDictionariesPane() {
  const config = useConfiguration();
  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
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
  const incomeCategories = c.dictionaries['income-category']?.entries ?? [];
  const expenseCategories = c.dictionaries['expense-category']?.entries ?? [];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <DictionaryList
            dictId="income-category"
            title="Income"
            entries={c.dictionaries['income-category']?.entries ?? []}
            addLabel="Add income category"
          />
          <DictionaryList
            dictId="expense-category"
            title="Expense"
            entries={c.dictionaries['expense-category']?.entries ?? []}
            addLabel="Add expense category"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Labels</CardTitle>
        </CardHeader>
        <CardContent>
          <DictionaryList
            dictId="labels"
            title="Labels"
            entries={c.dictionaries.labels?.entries ?? []}
            addLabel="Add label"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Default categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DefaultCategoryField
            field="defaultIncomeCategory"
            label="Default income category"
            current={c.defaultIncomeCategory}
            categories={incomeCategories}
          />
          <DefaultCategoryField
            field="defaultExpenseCategory"
            label="Default expense category"
            current={c.defaultExpenseCategory}
            categories={expenseCategories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
