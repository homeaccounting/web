import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DictionaryEntryResponse, UUID, UpdateDefaultsRequest } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { useUpdateDefaults } from '@/features/configuration/useUpdateDefaults';

interface Props {
  incomeCurrent: UUID | null;
  expenseCurrent: UUID | null;
  incomeCategories: DictionaryEntryResponse[];
  expenseCategories: DictionaryEntryResponse[];
}

function CategoryRow({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: DictionaryEntryResponse[];
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation('profile');
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-44 text-sm font-medium">
        {label}
      </label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-56" aria-label={label}>
          <SelectValue placeholder={t('selectPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DefaultCategoriesCard({
  incomeCurrent,
  expenseCurrent,
  incomeCategories,
  expenseCategories,
}: Props) {
  const { t } = useTranslation('profile');
  const update = useUpdateDefaults();
  const [income, setIncome] = useState<string>(incomeCurrent ?? '');
  const [expense, setExpense] = useState<string>(expenseCurrent ?? '');
  const dirty = income !== (incomeCurrent ?? '') || expense !== (expenseCurrent ?? '');

  const save = () => {
    const body: UpdateDefaultsRequest = {};
    if (income && income !== incomeCurrent) body.incomeCategory = income;
    if (expense && expense !== expenseCurrent) body.expenseCategory = expense;
    update.mutate(body, { onSuccess: () => toast.success(t('updated')) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('defaults.categoriesTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CategoryRow
          id="default-income-category"
          label={t('defaults.incomeCategory')}
          value={income}
          options={incomeCategories}
          onChange={setIncome}
        />
        <CategoryRow
          id="default-expense-category"
          label={t('defaults.expenseCategory')}
          value={expense}
          options={expenseCategories}
          onChange={setExpense}
        />
        <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t('saving') : t('common:save')}
        </Button>
        {update.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{update.error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
