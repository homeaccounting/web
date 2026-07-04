import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { ArrowLeftRight, Ban, ChevronDown, ChevronRight, Copy, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { useAccountById } from '@/features/accounts/useAccountById';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TransactionResponse, TransactionTypeText } from '@/api/types';
import { useWindowedTransactions } from './useWindowedTransactions';
import {
  applyTransactionFilters,
  defaultDateWindow,
  isValidDateWindow,
  type TransactionFilters,
} from './transactionFilters';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { isAdjustment, transactionKind, transactionTypeMeta } from './transactionType';
import type { TransactionKind } from './labels';
import { LabelChips } from './LabelChips';
import { CategoryChips } from './CategoryChips';
import { allocationCategoryIds } from './allocations';
import { TransactionPagination, usePersistedPageSize } from './TransactionPagination';
import { AccountHeader } from './AccountHeader';
import { ControlBar } from './ControlBar';
import { EditTransactionDialog } from './EditTransactionDialog';
import { CancelTransactionDialog } from './CancelTransactionDialog';
import { CopyTransactionDialog } from './CopyTransactionDialog';
import { ConvertTransactionDialog } from './ConvertTransactionDialog';
import { TransactionStatusIcon } from './TransactionStatusIcon';

// The two kinds a transaction can convert to (everything but its current kind;
// Adjustment is never a source or target). Caller must ensure `type` is not
// 'adjustment' — the submenu guard upstream enforces this.
const CONVERT_KINDS = ['income', 'expense', 'transfer'] as const;
function convertTargets(type: TransactionTypeText): TransactionKind[] {
  const current = transactionKind(type);
  return CONVERT_KINDS.filter((k) => k !== current);
}

const EMPTY_FILTERS: TransactionFilters = {
  description: '',
  labelIds: [],
  category: '',
  showCancelledFailed: false,
};

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();

  const [defaultWindow] = useState(() => defaultDateWindow(new Date()));
  const [fromInput, setFromInput] = useState(defaultWindow.from);
  const [toInput, setToInput] = useState(defaultWindow.to);
  const [appliedWindow, setAppliedWindow] = useState(defaultWindow);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  // Filter controls are collapsed by default to keep the pane simple.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = usePersistedPageSize();

  const { data, isLoading, isError, refetch } = useWindowedTransactions(
    id,
    appliedWindow.from,
    appliedWindow.to,
  );
  const { data: account, isLoading: accountLoading } = useAccountById(id);
  const { data: configuration } = useConfiguration();
  const labelNameById = useDictionaryEntryNames(configuration);
  // The same id->name map resolves category names for the Category column.
  const categoryNameById = labelNameById;

  const labelOptions = configuration?.dictionaries.labels?.entries ?? [];
  // The filter matches by category NAME (so a name shared across the income and
  // expense dictionaries — e.g. "Other" — matches either). The dropdown is
  // therefore deduped by name, and each option's value IS the name.
  const categoryOptions = useMemo(() => {
    const entries = [
      ...(configuration?.dictionaries['income-category']?.entries ?? []),
      ...(configuration?.dictionaries['expense-category']?.entries ?? []),
    ];
    const byName = new Map<string, string>();
    for (const e of entries) if (!byName.has(e.name)) byName.set(e.name, e.name);
    return [...byName.keys()].map((name) => ({ id: name, name }));
  }, [configuration]);

  const filtered = useMemo(
    () => applyTransactionFilters(data ?? [], filters, categoryNameById),
    [data, filters, categoryNameById],
  );
  // Count of active filter facets, surfaced on the (collapsed) toggle so the
  // user knows filters are narrowing the list. The date window is a primary
  // range control rather than a filter, so it is excluded here.
  const activeFilterCount =
    (filters.description.trim() ? 1 : 0) +
    (filters.labelIds.length > 0 ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.showCancelledFailed ? 1 : 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  const updateFilters = (next: TransactionFilters) => {
    setFilters(next);
    setPageIndex(0);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    const w = defaultDateWindow(new Date());
    setFromInput(w.from);
    setToInput(w.to);
    setAppliedWindow(w);
    setPageIndex(0);
  };
  const onFromChange = (from: string) => {
    setFromInput(from);
    if (isValidDateWindow(from, toInput)) {
      setAppliedWindow({ from, to: toInput });
      setPageIndex(0);
    }
  };
  const onToChange = (to: string) => {
    setToInput(to);
    if (isValidDateWindow(fromInput, to)) {
      setAppliedWindow({ from: fromInput, to });
      setPageIndex(0);
    }
  };

  const [editing, setEditing] = useState<TransactionResponse | null>(null);
  const openEdit = (t: TransactionResponse) => setEditing(t);

  const [cancelTarget, setCancelTarget] = useState<TransactionResponse | null>(null);
  const openCancel = (t: TransactionResponse) => setCancelTarget(t);

  const [copying, setCopying] = useState<TransactionResponse | null>(null);
  const openCopy = (t: TransactionResponse) => setCopying(t);

  const [converting, setConverting] = useState<{
    tx: TransactionResponse;
    targetKind: TransactionKind;
  } | null>(null);
  const openConvert = (tx: TransactionResponse, targetKind: TransactionKind) =>
    setConverting({ tx, targetKind });

  const header = account ? (
    <AccountHeader account={account} />
  ) : accountLoading ? (
    <div className="border-b px-4 py-3">
      <Skeleton className="h-8 w-full" />
    </div>
  ) : null;

  const showFilterBar = !!id && !isLoading;
  const showPagination = !!id && !isLoading && !isError && !!data && filtered.length > 0;

  let body: ReactNode;
  if (!id) {
    body = <div className="p-6 text-muted-foreground">Select an account.</div>;
  } else if (isLoading) {
    body = (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <div className="space-y-2 p-4">
        <Alert role="alert" variant="destructive">
          <AlertDescription>Could not load transactions.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (!data || data.length === 0) {
    body = <div className="p-6 text-muted-foreground">No transactions in this date range.</div>;
  } else if (filtered.length === 0) {
    body = <div className="p-6 text-muted-foreground">No transactions match your filters.</div>;
  } else {
    body = (
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="w-8 px-4 py-2" />
            <th className="px-4 py-2 text-left font-medium">Date</th>
            <th className="px-4 py-2 text-left font-medium">Description</th>
            <th className="w-40 px-4 py-2 text-left font-medium">Category</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
            <th className="w-20 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((t) => {
            // Display the leg matching the currently-viewed account so the
            // amount appears in that account's currency. Adjustments are
            // booked against an External account in the base currency, so
            // blindly using sourceAmount/sourceCurrency would show base
            // currency for any incoming transfer.
            const isTarget = t.targetAccountId === id && t.sourceAccountId !== id;
            const amount = isTarget ? t.targetAmount : -t.sourceAmount;
            const currency = isTarget ? t.targetCurrency : t.sourceCurrency;
            const negative = amount < 0;
            const deEmphasized = t.status === 'Failed' || t.status === 'Cancelled';
            return (
              <ContextMenu key={t.id}>
                <ContextMenuTrigger asChild>
                  <tr
                    className={cn(
                      'group cursor-pointer border-t hover:bg-muted/50',
                      deEmphasized && 'text-muted-foreground',
                    )}
                    role="button"
                    tabIndex={0}
                    onDoubleClick={() => openEdit(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEdit(t);
                      }
                    }}
                  >
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1">
                        <TransactionTypeIcon type={t.transactionType} />
                        <TransactionStatusIcon status={t.status} failureReason={t.failureReason} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      {formatDateTime(t.date)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn(deEmphasized && 'line-through')}>{t.description}</span>
                      <LabelChips
                        labelIds={t.labels}
                        nameById={labelNameById}
                        leadingGap={!!t.description}
                      />
                    </td>
                    <td className="w-40 overflow-hidden px-4 py-2">
                      {/* A (possibly split) transaction's categories render as
                          colored chips — the same treatment as labels. Chips
                          stay on one clipped line (full list in the title) so
                          the row height and column width never grow. */}
                      <CategoryChips
                        categoryIds={allocationCategoryIds(t)}
                        nameById={categoryNameById}
                        nowrap
                      />
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        negative && !deEmphasized && 'text-destructive',
                      )}
                    >
                      {formatMoney(amount, currency)}
                    </td>
                    <td className="w-20 px-2 py-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        {!isAdjustment(t.transactionType) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Duplicate"
                                  className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCopy(t);
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {t.status !== 'Cancelled' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Cancel"
                                  className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCancel(t);
                                  }}
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Cancel</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </span>
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => openEdit(t)}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden />
                    Edit
                  </ContextMenuItem>
                  {!isAdjustment(t.transactionType) && (
                    <ContextMenuItem onSelect={() => openCopy(t)}>
                      <Copy className="mr-2 h-4 w-4" aria-hidden />
                      Duplicate
                    </ContextMenuItem>
                  )}
                  {t.status === 'Completed' && !isAdjustment(t.transactionType) && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
                        Convert to
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {convertTargets(t.transactionType).map((k) => (
                          <ContextMenuItem key={k} onSelect={() => openConvert(t, k)}>
                            {transactionTypeMeta(k).label}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  {t.status !== 'Cancelled' && (
                    <ContextMenuItem className="text-destructive" onSelect={() => openCancel(t)}>
                      <Ban className="mr-2 h-4 w-4" aria-hidden />
                      Cancel
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <ControlBar selectedAccountId={id} selectedAccount={account} />
      {header}
      {showFilterBar && (
        <div className={cn('flex items-center px-3 py-2 text-sm', !filtersOpen && 'border-b')}>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
          >
            {filtersOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      )}
      {showFilterBar && filtersOpen && (
        <TransactionFilterBar
          from={fromInput}
          to={toInput}
          filters={filters}
          labelOptions={labelOptions}
          categoryOptions={categoryOptions}
          onFromChange={onFromChange}
          onToChange={onToChange}
          onFiltersChange={updateFilters}
          onClear={clearFilters}
        />
      )}
      {body}
      {showPagination && (
        <TransactionPagination
          total={filtered.length}
          pageIndex={clampedPage}
          pageSize={pageSize}
          onPageIndexChange={setPageIndex}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPageIndex(0);
          }}
        />
      )}
      {editing && (
        <EditTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          tx={editing}
        />
      )}
      {cancelTarget && (
        <CancelTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setCancelTarget(null);
          }}
          transaction={cancelTarget}
        />
      )}
      {copying && (
        <CopyTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setCopying(null);
          }}
          tx={copying}
        />
      )}
      {converting && (
        <ConvertTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setConverting(null);
          }}
          tx={converting.tx}
          targetKind={converting.targetKind}
        />
      )}
    </>
  );
}
