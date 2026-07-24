import { useConfiguration } from '@/features/configuration/useConfiguration';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <Tabs defaultValue="expense">
      <TabsList variant="underline">
        <TabsTrigger value="expense">Expense</TabsTrigger>
        <TabsTrigger value="income">Income</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
        <TabsTrigger value="label">Label</TabsTrigger>
      </TabsList>
      <TabsContent value="expense">
        <DictionaryList
          dictId="expense"
          title="Expense"
          dict={c.dictionaries['expense']}
          addLabel="Add expense category"
        />
      </TabsContent>
      <TabsContent value="income">
        <DictionaryList
          dictId="income"
          title="Income"
          dict={c.dictionaries['income']}
          addLabel="Add income category"
        />
      </TabsContent>
      <TabsContent value="contact">
        <DictionaryList
          dictId="contact"
          title="Contact"
          dict={c.dictionaries['contact']}
          addLabel="Add contact"
        />
      </TabsContent>
      <TabsContent value="label">
        <DictionaryList
          dictId="label"
          title="Labels"
          dict={c.dictionaries['label']}
          addLabel="Add label"
        />
      </TabsContent>
    </Tabs>
  );
}
