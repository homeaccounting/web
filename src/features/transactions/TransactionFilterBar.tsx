import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AccountResponse, DictionaryEntryResponse, UUID } from '@/api/types';
import { AccountMultiSelect } from './AccountMultiSelect';
import { CategoryCombobox } from './CategoryCombobox';
import { LabelMultiSelect } from './LabelMultiSelect';
import type { TransactionFilters } from './transactionFilters';

export interface TransactionFilterBarProps {
  filters: TransactionFilters;
  labelOptions: DictionaryEntryResponse[];
  categoryOptions: DictionaryEntryResponse[];
  contactOptions: DictionaryEntryResponse[];
  // Account scope is URL-based (distinct from the in-state TransactionFilters
  // above), so it is passed as separate props rather than folded into
  // `filters` — see the TransactionsPane wiring (Task 9).
  accountOptions: AccountResponse[];
  accountValue: UUID[];
  onAccountChange: (ids: UUID[]) => void;
  onFiltersChange: (next: TransactionFilters) => void;
  onClear: () => void;
}

export function TransactionFilterBar({
  filters,
  labelOptions,
  categoryOptions,
  contactOptions,
  accountOptions,
  accountValue,
  onAccountChange,
  onFiltersChange,
  onClear,
}: TransactionFilterBarProps) {
  const { t } = useTranslation('transactions');
  // Sentinel-first options so "All categories" deselects the field (spec §5).
  const categoryOpts = useMemo(
    () => [{ id: '', name: t('list.allCategories') }, ...categoryOptions],
    [categoryOptions, t],
  );
  // Same sentinel-first pattern for contacts; the committed value is the
  // contact's id ('' clears the filter), matching by id (not name).
  const contactOpts = useMemo(
    () => [{ id: '', name: t('list.anyContact') }, ...contactOptions],
    [contactOptions, t],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
      <div className="w-64">
        <AccountMultiSelect
          options={accountOptions}
          value={accountValue}
          onChange={onAccountChange}
          containerClassName="h-10 flex-nowrap overflow-x-auto"
        />
      </div>
      <Input
        placeholder={t('list.descriptionPlaceholder')}
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
          placeholder={t('list.allCategories')}
          onChange={(category) => onFiltersChange({ ...filters, category })}
        />
      </div>
      <div className="w-56">
        <CategoryCombobox
          options={contactOpts}
          value={filters.contactId}
          placeholder={t('list.anyContact')}
          aria-label={t('list.contact')}
          onChange={(contactId) => onFiltersChange({ ...filters, contactId })}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={filters.showCancelledFailed}
          onChange={(e) => onFiltersChange({ ...filters, showCancelledFailed: e.target.checked })}
          aria-label={t('list.cancelledFailed')}
          className="h-4 w-4 accent-primary"
        />
        {t('list.cancelledFailed')}
      </label>
      <Button variant="ghost" size="sm" onClick={onClear}>
        {t('list.clear')}
      </Button>
    </div>
  );
}
