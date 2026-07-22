import { useConfiguration } from '@/features/configuration/useConfiguration';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DictionaryList } from './DictionaryList';

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
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <DictionaryList
            dictId="income"
            title="Income"
            dict={c.dictionaries['income']}
            addLabel="Add income category"
          />
          <DictionaryList
            dictId="expense"
            title="Expense"
            dict={c.dictionaries['expense']}
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
            dictId="label"
            title="Labels"
            dict={c.dictionaries.label}
            addLabel="Add label"
          />
        </CardContent>
      </Card>
    </div>
  );
}
