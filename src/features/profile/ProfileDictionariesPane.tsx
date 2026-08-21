import { useTranslation } from 'react-i18next';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DictionaryList } from './DictionaryList';

export function ProfileDictionariesPane() {
  const { t } = useTranslation('profile');
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
      <div className="space-y-2">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('errors.loadConfiguration')}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void config.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    );
  }
  const c = config.data;
  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="expense">
          <TabsList variant="underline">
            <TabsTrigger value="expense">{t('dictionaries.tabs.expense')}</TabsTrigger>
            <TabsTrigger value="income">{t('dictionaries.tabs.income')}</TabsTrigger>
            <TabsTrigger value="contact">{t('dictionaries.tabs.contact')}</TabsTrigger>
            <TabsTrigger value="label">{t('dictionaries.tabs.label')}</TabsTrigger>
          </TabsList>
          <TabsContent value="expense">
            <DictionaryList
              dictId="expense"
              title={t('dictionaries.title.expense')}
              dict={c.dictionaries['expense']}
              addLabel={t('dictionaries.add.expense')}
            />
          </TabsContent>
          <TabsContent value="income">
            <DictionaryList
              dictId="income"
              title={t('dictionaries.title.income')}
              dict={c.dictionaries['income']}
              addLabel={t('dictionaries.add.income')}
            />
          </TabsContent>
          <TabsContent value="contact">
            <DictionaryList
              dictId="contact"
              title={t('dictionaries.title.contact')}
              dict={c.dictionaries['contact']}
              addLabel={t('dictionaries.add.contact')}
            />
          </TabsContent>
          <TabsContent value="label">
            <DictionaryList
              dictId="label"
              title={t('dictionaries.title.label')}
              dict={c.dictionaries['label']}
              addLabel={t('dictionaries.add.label')}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
