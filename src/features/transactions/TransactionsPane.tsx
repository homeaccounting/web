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
} from '@/components/ui/context-menu';
import { Ban, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { useAccountById } from '@/features/accounts/useAccountById';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TransactionResponse } from '@/api/types';
import { useWindowedTransactions } from './useWindowedTransactions';
import {
  applyTransactionFilters,
  defaultDateWindow,
  isValidDateWindow,
  type TransactionFilters,
} from './transactionFilters';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { LabelChips } from './LabelChips';
import { TransactionPagination, usePersistedPageSize } from './TransactionPagination';
import { AccountHeader } from './AccountHeader';
import { ControlBar } from './ControlBar';
import { EditTransactionDialog } from './EditTransactionDialog';
import { CancelTransactionDialog } from './CancelTransactionDialog';
import { TransactionStatusIcon } from './TransactionStatusIcon';

const EMPTY_FILTERS: TransactionFilters = {
  description: '',
  labelIds: [],
  categoryId: '',
  showCancelledFailed: false,
};

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();

  const [defaultWindow] = useState(() => defaultDateWindow(new Date()));
  const [fromInput, setFromInput] = useState(defaultWindow.from);
  const [toInput, setToInput] = useState(defaultWindow.to);
  const [appliedWindow, setAppliedWindow] = useState(defaultWindow);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
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
  const categoryOptions = useMemo(
    () => [
      ...(configuration?.dictionaries['income-category']?.entries ?? []),
      ...(configuration?.dictionaries['expense-category']?.entries ?? []),
    ],
    [configuration],
  );

  const filtered = useMemo(() => applyTransactionFilters(data ?? [], filters), [data, filters]);
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
            <th className="w-8 px-2 py-2" />
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
                    <td className="w-40 truncate px-4 py-2">
                      {t.category ? (categoryNameById.get(t.category) ?? '') : ''}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        negative && !deEmphasized && 'text-destructive',
                      )}
                    >
                      {formatMoney(amount, currency)}
                    </td>
                    <td className="w-8 px-2 py-2 text-right">
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
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => openEdit(t)}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden />
                    Edit
                  </ContextMenuItem>
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
    </>
  );
}
