import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DictionaryEntryResponse } from '@/api/types';
import { CategoryCombobox } from './CategoryCombobox';
import { LabelMultiSelect } from './LabelMultiSelect';
import type { TransactionFilters } from './transactionFilters';

export interface TransactionFilterBarProps {
  filters: TransactionFilters;
  labelOptions: DictionaryEntryResponse[];
  categoryOptions: DictionaryEntryResponse[];
  contactOptions: DictionaryEntryResponse[];
  onFiltersChange: (next: TransactionFilters) => void;
  onClear: () => void;
}

export function TransactionFilterBar({
  filters,
  labelOptions,
  categoryOptions,
  contactOptions,
  onFiltersChange,
  onClear,
}: TransactionFilterBarProps) {
  // Sentinel-first options so "All categories" deselects the field (spec §5).
  const categoryOpts = useMemo(
    () => [{ id: '', name: 'All categories' }, ...categoryOptions],
    [categoryOptions],
  );
  // Same sentinel-first pattern for contacts; the committed value is the
  // contact's id ('' clears the filter), matching by id (not name).
  const contactOpts = useMemo(
    () => [{ id: '', name: 'Any contact' }, ...contactOptions],
    [contactOptions],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
      <Input
        placeholder="Description…"
        value={filters.description}
        onChange={(e) => onFiltersChange({ ...filters, description: e.target.value })}
        className="h-10 w-72"
      />
      <div className="w-72">
        <LabelMultiSelect
          options={labelOptions}
          value={filters.labelIds}
          onChange={(labelIds) => onFiltersChange({ ...filters, labelIds })}
          containerClassName="h-10 flex-nowrap overflow-x-auto"
        />
      </div>
      <div className="w-56">
        <CategoryCombobox
          options={categoryOpts}
          value={filters.category}
          placeholder="All categories"
          onChange={(category) => onFiltersChange({ ...filters, category })}
        />
      </div>
      <div className="w-56">
        <CategoryCombobox
          options={contactOpts}
          value={filters.contactId}
          placeholder="Any contact"
          aria-label="Contact"
          onChange={(contactId) => onFiltersChange({ ...filters, contactId })}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={filters.showCancelledFailed}
          onChange={(e) => onFiltersChange({ ...filters, showCancelledFailed: e.target.checked })}
          aria-label="Cancelled & failed"
          className="h-4 w-4 accent-primary"
        />
        Cancelled &amp; failed
      </label>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
