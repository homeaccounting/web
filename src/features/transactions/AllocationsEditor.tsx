import { useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { CategoryCombobox } from './CategoryCombobox';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DictionaryEntryResponse } from '@/api/types';

export interface AllocationSection {
  name: 'incomes' | 'expenses';
  title: string;
  addLabel: string;
  categories: DictionaryEntryResponse[];
  /** When true, the section starts collapsed and the heading toggles it. */
  collapsible?: boolean;
}

export interface AllocationsEditorProps {
  sections: AllocationSection[];
  /** Currency for the total display; '' renders the plain number. */
  currency: string;
}

type Slice = { category: string; amount: number; comment: string };

// Sum every row across all sections, ignoring blank/non-finite amounts.
function sumSlices(rows: Slice[] | undefined): number {
  if (!rows) return 0;
  return rows.reduce((acc, row) => {
    const n = typeof row?.amount === 'number' ? row.amount : Number(row?.amount);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
}

function AllocationSectionRows({ section }: { section: AllocationSection }) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: section.name });

  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div key={field.id} className="space-y-1.5 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <FormField
              control={control}
              name={`${section.name}.${i}.category`}
              render={({ field: f }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <CategoryCombobox
                      options={section.categories}
                      value={(f.value as string) ?? ''}
                      onChange={f.onChange}
                      name={f.name}
                      aria-label="Category"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`${section.name}.${i}.amount`}
              render={({ field: f }) => (
                <FormItem className="w-32">
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      aria-label="Amount"
                      placeholder="Amount"
                      name={f.name}
                      ref={f.ref}
                      onBlur={f.onBlur}
                      value={
                        f.value === undefined ||
                        f.value === null ||
                        (typeof f.value === 'number' && Number.isNaN(f.value))
                          ? ''
                          : (f.value as number | string)
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '' || raw === '-') {
                          f.onChange(raw);
                          return;
                        }
                        const n = e.target.valueAsNumber;
                        f.onChange(Number.isNaN(n) ? raw : n);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Match the dialog's own close affordance: a bare 16px icon with an
                opacity hover, not a full-size icon Button (which dwarfed it). */}
            <button
              type="button"
              aria-label="Remove row"
              onClick={() => remove(i)}
              className="mt-3 shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <FormField
            control={control}
            name={`${section.name}.${i}.comment`}
            render={({ field: f }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="text"
                    aria-label="Comment"
                    placeholder="Comment (optional)"
                    className="h-8 text-sm"
                    name={f.name}
                    ref={f.ref}
                    onBlur={f.onBlur}
                    onChange={f.onChange}
                    value={(f.value as string) ?? ''}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ category: '', amount: NaN, comment: '' })}
      >
        {section.addLabel}
      </Button>
      <SectionError name={section.name} />
    </div>
  );
}

// Section-level errors (e.g. "Add at least one category", balance exceeded) are
// attached to the array field itself, not a row. zod's resolver may place them
// either directly on the array path or on its synthetic `.root`, so read both.
function SectionError({ name }: { name: 'incomes' | 'expenses' }) {
  const {
    formState: { errors },
  } = useFormContext();
  const fieldError = errors[name] as { message?: string; root?: { message?: string } } | undefined;
  const message = fieldError?.message ?? fieldError?.root?.message;
  if (!message) return null;
  return <p className="text-sm font-medium text-destructive">{message}</p>;
}

function Section({ section }: { section: AllocationSection }) {
  const [expanded, setExpanded] = useState(!section.collapsible);

  if (!section.collapsible) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{section.title}</h3>
        <AllocationSectionRows section={section} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden />
        )}
        {section.title}
      </button>
      {expanded && <AllocationSectionRows section={section} />}
    </div>
  );
}

export function AllocationsEditor({ sections, currency }: AllocationsEditorProps) {
  const { watch } = useFormContext();
  const incomes = watch('incomes') as Slice[] | undefined;
  const expenses = watch('expenses') as Slice[] | undefined;
  const total = sumSlices(incomes) + sumSlices(expenses);

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <Section key={section.name} section={section} />
      ))}
      <div
        data-testid="allocations-total"
        className={cn('flex justify-end text-sm font-medium tabular-nums')}
      >
        Total: {currency ? formatMoney(total, currency) : String(total)}
      </div>
    </div>
  );
}
