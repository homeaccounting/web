import { useState } from 'react';
import type { DictionaryEntryResponse, UUID, UpdateDefaultsRequest } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateDefaults } from '@/features/configuration/useUpdateDefaults';

const NONE_VALUE = '__none__';

interface DefaultCategoryFieldProps {
  field: 'defaultIncomeCategory' | 'defaultExpenseCategory';
  label: string;
  current: UUID | null;
  categories: DictionaryEntryResponse[];
}

export function DefaultCategoryField({
  field,
  label,
  current,
  categories,
}: DefaultCategoryFieldProps) {
  const update = useUpdateDefaults();
  const [selected, setSelected] = useState<string>(current ?? NONE_VALUE);
  const dirty = selected !== (current ?? NONE_VALUE);

  const save = () => {
    const body: UpdateDefaultsRequest = {
      [field]: selected === NONE_VALUE ? null : selected,
    };
    update.mutate(body);
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-labelledby={`${field}-label`}
    >
      <div className="flex items-center gap-3">
        <label id={`${field}-label`} htmlFor={field} className="w-40 text-sm font-medium">
          {label}
        </label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger id={field} className="w-48" aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>— none —</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {update.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{update.error.message}</AlertDescription>
        </Alert>
      )}
      {update.isSuccess && <p className="text-sm text-green-600">Updated.</p>}
    </form>
  );
}
