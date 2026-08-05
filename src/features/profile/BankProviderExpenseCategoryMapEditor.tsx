import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { useUpdateBanking } from '@/features/configuration/useUpdateBanking';
import {
  parseBankProviderCategoryKey,
  bankProviderCategoryRowSchema,
  renderBankProviderCategoryKey,
} from './bankConnectionSchema';

type Kind = 'mcc' | 'label';

interface Row {
  kind: Kind;
  value: string;
  categoryId: string;
}

interface BankProviderExpenseCategoryMapEditorProps {
  // The bank-provider category → expense-category map. Keys are tagged strings
  // (`"mcc:0742"` / `"label:eating_out"`); see BankingConfigurationDTO.
  value: Record<string, UUID>;
  expenseCategories: DictionaryEntryResponse[];
}

// Editor for the bank-provider category → expense-category map (tracker#51/#52).
// A key is either an ISO-18245 MCC (numeric; a global namespace shared across
// MCC providers) or a bank provider's own label (free text; provider-specific).
// Both kinds live in one map and are edited identically. Seeded label rows make
// known labels re-pointable without typing — just change the category dropdown.
export function BankProviderExpenseCategoryMapEditor({
  value,
  expenseCategories,
}: BankProviderExpenseCategoryMapEditorProps) {
  const update = useUpdateBanking();
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([key, categoryId]) => {
      const parsed = parseBankProviderCategoryKey(key) ?? { kind: 'label' as const, value: key };
      return { kind: parsed.kind, value: parsed.value, categoryId };
    }),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { kind: 'mcc', value: '', categoryId: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const save = () => {
    setValidationError(null);
    const map: Record<string, UUID> = {};
    for (const row of rows) {
      const parsed = bankProviderCategoryRowSchema.safeParse(row);
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message ?? 'Invalid mapping');
        return;
      }
      const key = renderBankProviderCategoryKey(parsed.data);
      if (map[key] !== undefined) {
        setValidationError(`Duplicate mapping: ${key}`);
        return;
      }
      map[key] = parsed.data.categoryId;
    }
    update.mutate({ expenseCategoryMap: map }, { onSuccess: () => toast.success('Updated.') });
  };

  const opError = validationError ?? update.error?.message ?? null;

  return (
    <section className="space-y-3" aria-labelledby="bank-provider-expense-category-mapping-heading">
      <h3 id="bank-provider-expense-category-mapping-heading" className="sr-only">
        Bank provider category to expense category mapping
      </h3>
      {rows.length === 0 && <EmptyState message="No mappings yet." className="p-0" />}
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const kindLabel = `Kind, row ${index + 1}`;
          const valueLabel =
            row.kind === 'mcc'
              ? `MCC code, row ${index + 1}`
              : `Bank provider label, row ${index + 1}`;
          const categoryLabel = `Expense category, row ${index + 1}`;
          return (
            <li key={index} className="flex items-center gap-2">
              <Select value={row.kind} onValueChange={(v) => setRow(index, { kind: v as Kind })}>
                <SelectTrigger className="w-24" aria-label={kindLabel}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcc">MCC</SelectItem>
                  <SelectItem value="label">Label</SelectItem>
                </SelectContent>
              </Select>
              {row.kind === 'mcc' ? (
                <Input
                  value={row.value}
                  onChange={(e) => setRow(index, { value: e.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="MCC"
                  className="w-28"
                  aria-label={valueLabel}
                />
              ) : (
                <Input
                  value={row.value}
                  onChange={(e) => setRow(index, { value: e.target.value })}
                  placeholder="Bank provider label"
                  className="flex-1"
                  aria-label={valueLabel}
                />
              )}
              <Select
                value={row.categoryId || undefined}
                onValueChange={(v) => setRow(index, { categoryId: v })}
              >
                <SelectTrigger className="flex-1" aria-label={categoryLabel}>
                  <SelectValue placeholder="Expense category" />
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
                aria-label={`Remove mapping ${row.value || `row ${index + 1}`}`}
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
    </section>
  );
}
