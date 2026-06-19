import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/DatePicker';
import type { DictionaryEntryResponse } from '@/api/types';
import { CategoryCombobox } from './CategoryCombobox';
import { LabelMultiSelect } from './LabelMultiSelect';
import type { TransactionFilters } from './transactionFilters';

export interface TransactionFilterBarProps {
  from: string;
  to: string;
  filters: TransactionFilters;
  labelOptions: DictionaryEntryResponse[];
  categoryOptions: DictionaryEntryResponse[];
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFiltersChange: (next: TransactionFilters) => void;
  onClear: () => void;
}

export function TransactionFilterBar({
  from,
  to,
  filters,
  labelOptions,
  categoryOptions,
  onFromChange,
  onToChange,
  onFiltersChange,
  onClear,
}: TransactionFilterBarProps) {
  // Sentinel-first options so "All categories" deselects the field (spec §5).
  const categoryOpts = useMemo(
    () => [{ id: '', name: 'All categories' }, ...categoryOptions],
    [categoryOptions],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
      <label htmlFor="filter-from" className="flex items-center gap-1">
        From
        <DatePicker
          id="filter-from"
          value={from}
          onChange={onFromChange}
          aria-label="From"
          maxDate={to}
          placeholder="From"
          className="w-auto"
        />
      </label>
      <label htmlFor="filter-to" className="flex items-center gap-1">
        To
        <DatePicker
          id="filter-to"
          value={to}
          onChange={onToChange}
          aria-label="To"
          minDate={from}
          placeholder="To"
          className="w-auto"
        />
      </label>
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
