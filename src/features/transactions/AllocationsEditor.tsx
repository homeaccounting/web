import { useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/MoneyInput';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { CategoryCombobox } from './CategoryCombobox';
import { formatMoney } from '@/lib/format';
import { roundMoney } from '@/lib/money';
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
  /**
   * When true, the target is fixed: hide the "Target" toggle and render the
   * target amount as read-only text instead of the editable input.
   * `targetMode`/`targetTotal` still come from form state (the caller seeds
   * them), so the diff/remaining readout is unchanged. Defaults to the
   * create/edit behavior (toggle visible, target editable).
   */
  lockTarget?: boolean;
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

// The amount still needed to hit the pinned target (target − current sum), or 0
// when target mode is off or the target is blank. The sum is rounded the same way
// the submit gate does (schema.ts refineAllocations) so the diff indicator, the
// Fill helper, and the gate all agree on "balanced". Single source of the formula.
function targetRemaining(
  targetMode: boolean,
  targetTotalRaw: number | '' | undefined,
  incomes: Slice[] | undefined,
  expenses: Slice[] | undefined,
): { hasTarget: boolean; remaining: number } {
  const hasTarget =
    targetMode &&
    targetTotalRaw !== '' &&
    targetTotalRaw !== undefined &&
    Number.isFinite(Number(targetTotalRaw));
  const remaining = hasTarget
    ? roundMoney(Number(targetTotalRaw) - roundMoney(sumSlices(incomes) + sumSlices(expenses)))
    : 0;
  return { hasTarget, remaining };
}

function AllocationSectionRows({
  section,
  currency,
}: {
  section: AllocationSection;
  currency: string;
}) {
  const { control, watch, setValue } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: section.name });

  const targetMode = Boolean(watch('targetMode'));
  const targetTotalRaw = watch('targetTotal') as number | '' | undefined;
  const incomes = watch('incomes') as Slice[] | undefined;
  const expenses = watch('expenses') as Slice[] | undefined;
  const { hasTarget, remaining } = targetRemaining(targetMode, targetTotalRaw, incomes, expenses);
  // The section's rows, watched so the Fill button reacts to amount edits. When any
  // row is empty/non-finite, limit Fill to those rows so users fill blanks first;
  // when all rows are finite, Fill appears on every row.
  const sectionRows = (section.name === 'incomes' ? incomes : expenses) ?? [];
  const isFiniteAmount = (a: unknown) => Number.isFinite(typeof a === 'number' ? a : Number(a));
  const hasEmptyRow = sectionRows.some((r) => !isFiniteAmount(r?.amount));

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
                <FormItem className="w-44">
                  <FormControl>
                    <MoneyInput
                      currency={currency}
                      placeholder="Amount"
                      value={f.value as number | string}
                      onChange={f.onChange}
                      name={f.name}
                      onBlur={f.onBlur}
                      inputRef={f.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {hasTarget &&
              Math.abs(remaining) >= 0.005 &&
              (() => {
                const currentRaw = sectionRows[i]?.amount;
                const currentIsFinite = isFiniteAmount(currentRaw);
                // Fill blanks first: skip already-filled rows while any row is empty.
                if (hasEmptyRow && currentIsFinite) return null;
                const current = currentIsFinite ? Number(currentRaw) : 0;
                const next = roundMoney(current + remaining);
                if (next <= 0) return null;
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 shrink-0"
                    onClick={() =>
                      setValue(`${section.name}.${i}.amount`, next, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  >
                    Fill {currency ? formatMoney(next, currency) : String(next)}
                  </Button>
                );
              })()}
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
                    placeholder="Comment"
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

function Section({ section, currency }: { section: AllocationSection; currency: string }) {
  const [expanded, setExpanded] = useState(!section.collapsible);

  if (!section.collapsible) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{section.title}</h3>
        <AllocationSectionRows section={section} currency={currency} />
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
      {expanded && <AllocationSectionRows section={section} currency={currency} />}
    </div>
  );
}

export function AllocationsEditor({ sections, currency, lockTarget }: AllocationsEditorProps) {
  const { control, watch, setValue } = useFormContext();
  const incomes = watch('incomes') as Slice[] | undefined;
  const expenses = watch('expenses') as Slice[] | undefined;
  const targetMode = Boolean(watch('targetMode'));
  const targetTotalRaw = watch('targetTotal') as number | '' | undefined;
  const sum = roundMoney(sumSlices(incomes) + sumSlices(expenses));
  const { hasTarget, remaining } = targetRemaining(targetMode, targetTotalRaw, incomes, expenses);
  const balanced = hasTarget && Math.abs(remaining) < 0.005;
  const money = (n: number) => (currency ? formatMoney(n, currency) : String(n));
  // Progress toward the target: bar fills sum/target (capped at 100%), full when
  // balanced or over. Colour signals state; the caption gives the exact remaining.
  const target = hasTarget ? Number(targetTotalRaw) : 0;
  const fillPct =
    balanced || remaining < 0 ? 100 : target > 0 ? Math.min(100, (sum / target) * 100) : 0;
  const barColor = balanced ? 'bg-positive' : remaining < 0 ? 'bg-destructive' : 'bg-primary';
  const captionColor = balanced
    ? 'text-positive'
    : remaining < 0
      ? 'text-destructive'
      : 'text-muted-foreground';

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <Section key={section.name} section={section} currency={currency} />
      ))}
      {/* All total-related controls grouped in a card: the target toggle/input,
          the Total line, and — when a target is set — a progress bar filling toward
          the target with a short remaining caption. Colour signals the state
          (primary/muted = under, destructive = over, emerald = balanced). */}
      <Card data-testid="allocations-totals-card" className="space-y-3 p-4">
        {/* When the target is locked (e.g. refund flow) the toggle is hidden and
            the target is shown read-only; otherwise it's a user checkbox. When the
            target is off, the Total shares this row (toggle left, Total right) so
            the collapsed card stays a single compact line with no wasted space. */}
        {lockTarget ? (
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Target</span>
            <span data-testid="allocations-target-readout" className="tabular-nums">
              {money(hasTarget ? target : 0)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={targetMode}
                onChange={(e) => {
                  const on = e.target.checked;
                  setValue('targetMode', on, { shouldDirty: true, shouldValidate: true });
                  // Enabling seeds the target with the current allocations total:
                  // editing usually tweaks the allocation split, not the overall
                  // amount, so starting from the existing sum beats a blank field.
                  if (on) {
                    setValue('targetTotal', sum, { shouldDirty: true, shouldValidate: true });
                  }
                }}
              />
              Target
            </label>
            {!targetMode && (
              <div data-testid="allocations-total" className="text-sm font-medium tabular-nums">
                Total: {money(sum)}
              </div>
            )}
          </div>
        )}
        {/* Once a target is active (editable or locked) the input and Total move to
            their own row — input left, Total right. */}
        {(targetMode || lockTarget) && (
          <div
            className={cn('flex items-end gap-3', targetMode ? 'justify-between' : 'justify-end')}
          >
            {targetMode && !lockTarget && (
              <FormField
                control={control}
                name="targetTotal"
                render={({ field: f }) => (
                  <FormItem className="w-40">
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        aria-label="Target total"
                        placeholder="Target"
                        name={f.name}
                        ref={f.ref}
                        onBlur={f.onBlur}
                        value={
                          f.value === undefined || f.value === null
                            ? ''
                            : (f.value as number | string)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            f.onChange('');
                            return;
                          }
                          const n = e.target.valueAsNumber;
                          f.onChange(Number.isNaN(n) ? '' : n);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div data-testid="allocations-total" className="text-sm font-medium tabular-nums">
              Total: {money(sum)}
            </div>
          </div>
        )}
        {hasTarget && (
          <div className="space-y-1">
            <div
              role="progressbar"
              aria-label="Allocated toward target"
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={sum}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn('h-full rounded-full transition-all', barColor)}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <div
              data-testid="allocations-diff"
              className={cn(
                'flex items-center justify-end gap-1 text-sm font-medium tabular-nums',
                captionColor,
              )}
            >
              {balanced ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Balanced
                </>
              ) : remaining > 0 ? (
                `${money(remaining)} left`
              ) : (
                `${money(-remaining)} over`
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
