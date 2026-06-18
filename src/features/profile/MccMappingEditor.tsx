import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateBanking } from '@/features/configuration/useUpdateBanking';
import { mccRowSchema } from './bankConnectionSchema';

interface Row {
  mcc: string;
  categoryId: string;
}

interface MccMappingEditorProps {
  value: Record<string, UUID>;
  expenseCategories: DictionaryEntryResponse[];
}

export function MccMappingEditor({ value, expenseCategories }: MccMappingEditorProps) {
  const update = useUpdateBanking();
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([mcc, categoryId]) => ({ mcc, categoryId })),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { mcc: '', categoryId: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const save = () => {
    setValidationError(null);
    const map: Record<string, UUID> = {};
    for (const row of rows) {
      const parsed = mccRowSchema.safeParse(row);
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message ?? 'Invalid mapping');
        return;
      }
      if (map[parsed.data.mcc] !== undefined) {
        setValidationError(`Duplicate MCC code: ${parsed.data.mcc}`);
        return;
      }
      map[parsed.data.mcc] = parsed.data.categoryId;
    }
    update.mutate({ mccExpenseCategoryMap: map });
  };

  const opError = validationError ?? update.error?.message ?? null;

  return (
    <section className="space-y-3" aria-labelledby="mcc-mapping-heading">
      <h3 id="mcc-mapping-heading" className="sr-only">
        MCC to category mapping
      </h3>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No mappings yet</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const mccLabel = `MCC code, row ${index + 1}`;
          const categoryLabel = `Category, row ${index + 1}`;
          return (
            <li key={index} className="flex items-center gap-2">
              <Input
                value={row.mcc}
                onChange={(e) => setRow(index, { mcc: e.target.value })}
                inputMode="numeric"
                maxLength={4}
                placeholder="MCC"
                className="w-24"
                aria-label={mccLabel}
              />
              <Select
                value={row.categoryId || undefined}
                onValueChange={(v) => setRow(index, { categoryId: v })}
              >
                <SelectTrigger className="flex-1" aria-label={categoryLabel}>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove mapping ${row.mcc || `row ${index + 1}`}`}
                onClick={() => removeRow(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Add mapping
        </Button>
        <Button size="sm" onClick={save} disabled={update.isPending} aria-label="Save mapping">
          {update.isPending ? 'Saving…' : 'Save mapping'}
        </Button>
      </div>
      {opError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{opError}</AlertDescription>
        </Alert>
      )}
      {update.isSuccess && !validationError && <p className="text-sm text-green-600">Updated.</p>}
    </section>
  );
}
