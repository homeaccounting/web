import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { ArrowLeftRight, Ban, ChevronDown, ChevronRight, Copy, Pencil, Undo2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { useAccountById } from '@/features/accounts/useAccountById';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { flattenDictionary } from '@/api/dictionary';
import type { Allocations, TransactionResponse, TransactionTypeText, UUID } from '@/api/types';
import { useWindowedTransactions } from './useWindowedTransactions';
import { applyTransactionFilters, type TransactionFilters } from './transactionFilters';
import {
  parsePeriodParams,
  periodParamsToSearch,
  presetRange,
  type DayRange,
  type PeriodValue,
} from '@/lib/period';
import { PeriodSelector } from '@/components/PeriodSelector';
import { readLastView, writeLastView } from './lastView';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import {
  isAdjustment,
  isExpense,
  isIncome,
  isTransfer,
  transactionKind,
  transactionTypeMeta,
} from './transactionType';
import type { TransactionKind } from './labels';
import { LabelChips } from './LabelChips';
import { CategoryChips } from './CategoryChips';
import { RelationBadge } from './RelationBadge';
import { buildRelationIndex } from './relationIndex';
import { useUnlinkRelation } from './useUnlinkRelation';
import { LinkTransactionDialog } from './LinkTransactionDialog';
import { allocationCategoryIds, allocationComments } from './allocations';
import { TransactionPagination, usePersistedPageSize } from './TransactionPagination';
import { AccountHeader } from './AccountHeader';
import { ControlBar } from './ControlBar';
import { EditTransactionDialog } from './EditTransactionDialog';
import { CancelTransactionDialog } from './CancelTransactionDialog';
import { CopyTransactionDialog } from './CopyTransactionDialog';
import { ConvertTransactionDialog } from './ConvertTransactionDialog';
import { RefundTransactionDialog } from './RefundTransactionDialog';
import { MergeTransactionsDialog } from './MergeTransactionsDialog';
import { checkMergeEligibility, MERGE_INELIGIBILITY_MESSAGE } from './mergeEligibility';
import { useTransactionSelection } from './useTransactionSelection';
import { SelectionActionBar } from './SelectionActionBar';
import { TransactionStatusIcon } from './TransactionStatusIcon';
import { useCreateDictionaryEntry } from '@/features/configuration/useCreateDictionaryEntry';
import { TxCategoryQuickPicker } from './TxCategoryQuickPicker';
import { TxLabelQuickPicker } from './TxLabelQuickPicker';
import { TxContactQuickPicker } from './TxContactQuickPicker';
import { ContactChip } from './ContactChip';
import { useEditTransaction } from './useEditTransaction';

// The two kinds a transaction can convert to (everything but its current kind;
// Adjustment is never a source or target). Caller must ensure `type` is not
// 'adjustment' — the submenu guard upstream enforces this.
const CONVERT_KINDS = ['income', 'expense', 'transfer'] as const;
function convertTargets(type: TransactionTypeText): TransactionKind[] {
  const current = transactionKind(type);
  return CONVERT_KINDS.filter((k) => k !== current);
}

// Accounts whose cached transaction lists hold this row — mirrors
// EditTransactionDialog's derivation so useEditTransaction patches the right caches.
function affectedAccountIds(t: TransactionResponse): UUID[] {
  if (isTransfer(t.transactionType) || isAdjustment(t.transactionType)) {
    return [t.sourceAccountId, t.targetAccountId];
  }
  return [isIncome(t.transactionType) ? t.targetAccountId : t.sourceAccountId];
}

// Rebuild allocations with a new categoryId on the single slice (in whichever
// bucket it lives), preserving that slice's amount/comment. Caller guarantees
// exactly one slice total.
function allocationsWithCategory(allocations: Allocations, categoryId: UUID): Allocations {
  const swap = (slices: Allocations['incomes']) => slices.map((s) => ({ ...s, categoryId }));
  return {
    incomes: allocations.incomes.length ? swap(allocations.incomes) : allocations.incomes,
    expenses: allocations.expenses.length ? swap(allocations.expenses) : allocations.expenses,
  };
}

// A resolved association edge to render for a row: the id/description of the
// counterpart and whether it is cancelled (drives the "(cancelled)" marker).
interface AssocEdge {
  relatedTransactionId: string;
  description?: string;
  counterpartCancelled?: boolean;
}

// Association badges for a single row, with an unlink affordance. `useUnlinkRelation`
// is per-transaction, so this lives in its own component (hooks can't be called
// inside the row map). The parent resolves the counterpart edges from the loaded
// window; this only renders and wires unlink behind a confirm.
function AssociationBadges({ actingId, edges }: { actingId: string; edges: AssocEdge[] }) {
  const unlink = useUnlinkRelation(actingId);
  // Holds the edge awaiting confirmation in the AlertDialog below; null means
  // no dialog is open. Set by the badge's unlink affordance, cleared by both
  // the confirm and cancel actions.
  const [pendingUnlink, setPendingUnlink] = useState<AssocEdge | null>(null);
  if (edges.length === 0) return null;
  return (
    <>
      {edges.map((e) => (
        <RelationBadge
          key={e.relatedTransactionId}
          kind="associated"
          mode="counterpart"
          description={e.description}
          counterpartCancelled={e.counterpartCancelled}
          onUnlink={() => setPendingUnlink(e)}
        />
      ))}
      <AlertDialog
        open={pendingUnlink !== null}
        onOpenChange={(open) => !open && setPendingUnlink(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove association?</AlertDialogTitle>
            <AlertDialogDescription>
              This detaches the link between the two transactions. Neither transaction is otherwise
              changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUnlink) {
                  void unlink.mutateAsync({
                    relatedTransactionId: pendingUnlink.relatedTransactionId,
                    relationKind: 'associated',
                  });
                }
                setPendingUnlink(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const EMPTY_FILTERS: TransactionFilters = {
  description: '',
  labelIds: [],
  category: '',
  contactId: '',
  showCancelledFailed: false,
};

// Date-range presets offered in the toolbar. The default window is the previous
// whole calendar month ('last-month'); 'custom' is appended by PeriodSelector.
const TX_PRESETS = ['this-month', 'last-month', 'this-year', 'last-year'] as const;

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();

  // The date range is derived from the URL (?period / ?from / ?to), falling back
  // to the persisted "last view" and finally the default 'last-month' preset.
  const [searchParams, setSearchParams] = useSearchParams();
  const lastView = useMemo(() => readLastView(), []);
  const { periodValue, dayRange } = parsePeriodParams(searchParams, new Date(), {
    presets: TX_PRESETS,
    defaultPreset: 'last-month',
    fallback: lastView
      ? { period: lastView.period, from: lastView.from, to: lastView.to }
      : undefined,
  });
  const onPresetChange = (next: PeriodValue) => {
    setSearchParams(periodParamsToSearch(next, dayRange), { replace: true });
    setPageIndex(0);
  };
  const onRangeChange = (range: DayRange) => {
    setSearchParams(periodParamsToSearch('custom', range), { replace: true });
    setPageIndex(0);
  };

  const [filters, setFilters] = useState<TransactionFilters>(
    () => lastView?.filters ?? EMPTY_FILTERS,
  );
  // Filter controls are collapsed by default to keep the pane simple.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = usePersistedPageSize();

  // Persist the current account + period (+ custom bounds) + filters so the
  // view can be restored on reopen. Guard on `id` so bare `/` never writes an
  // empty accountId.
  useEffect(() => {
    if (!id) return;
    writeLastView({
      accountId: id,
      period: periodValue,
      ...(periodValue === 'custom' ? { from: dayRange.from, to: dayRange.to } : {}),
      filters,
    });
  }, [id, periodValue, dayRange.from, dayRange.to, filters]);

  const { data, isLoading, isError, refetch } = useWindowedTransactions(
    id,
    dayRange.from,
    dayRange.to,
  );
  const { data: account, isLoading: accountLoading } = useAccountById(id);
  const { data: configuration } = useConfiguration();
  const labelNameById = useDictionaryEntryNames(configuration);
  // The same id->name map resolves category names for the Category column.
  const categoryNameById = labelNameById;

  const labelOptions = flattenDictionary(configuration?.dictionaries.label);
  const contactOptions = useMemo(
    () => flattenDictionary(configuration?.dictionaries.contact),
    [configuration],
  );

  const edit = useEditTransaction();

  const incomeCategoryEntries = flattenDictionary(configuration?.dictionaries['income']);
  const expenseCategoryEntries = flattenDictionary(configuration?.dictionaries['expense']);

  const assignCategory = (t: TransactionResponse, categoryId: UUID) => {
    const current = allocationCategoryIds(t)[0];
    if (!current || categoryId === current) return; // no-op
    void edit
      .mutateAsync({
        id: t.id,
        accountIds: affectedAccountIds(t),
        diff: { allocations: allocationsWithCategory(t.allocations, categoryId) },
        onSubCallApplied: () => {},
      })
      .catch(() => {
        // No error surface in the pane yet (matches useUnlinkRelation's fire-and-forget);
        // a failed PATCH simply leaves the row's category unchanged. The comment keeps
        // eslint `no-empty` happy.
      });
  };

  const commitLabels = (t: TransactionResponse, labels: UUID[]) =>
    edit.mutateAsync({
      id: t.id,
      accountIds: affectedAccountIds(t),
      diff: { labels },
      onSubCallApplied: () => {},
    });

  // Replace (or, with null, clear) the transaction's contact. Mirrors
  // commitLabels; presence of `contactId` in the diff drives the PUT.
  const commitContact = (t: TransactionResponse, contactId: UUID | null) =>
    edit.mutateAsync({
      id: t.id,
      accountIds: affectedAccountIds(t),
      diff: { contactId },
      onSubCallApplied: () => {},
    });

  // Create a new root-level item in any dictionary from a quick-picker's create
  // row and hand back its id so the picker can assign it through its own commit
  // path. The dictionary slug matches configuration.dictionaries[dictId]
  // ('label', 'contact', …).
  const create = useCreateDictionaryEntry();
  const createEntry = async (dictId: string, name: string): Promise<UUID | null> => {
    try {
      const r = await create.mutateAsync({
        dictId,
        name,
        dict: configuration?.dictionaries[dictId],
      });
      return r.id;
    } catch {
      return null;
    }
  };
  // The filter matches by category NAME (so a name shared across the income and
  // expense dictionaries — e.g. "Other" — matches either). The dropdown is
  // therefore deduped by name, and each option's value IS the name.
  const categoryOptions = useMemo(() => {
    const entries = [
      ...flattenDictionary(configuration?.dictionaries['income']),
      ...flattenDictionary(configuration?.dictionaries['expense']),
    ];
    const byName = new Map<string, string>();
    for (const e of entries) if (!byName.has(e.name)) byName.set(e.name, e.name);
    return [...byName.keys()].map((name) => ({ id: name, name }));
  }, [configuration]);

  // Multi-selection drives the bulk Link/Merge actions. The reset key clears the
  // selection whenever the scope (account / date window / filters) changes, but
  // NOT on page changes — so a selection can span pages for a merge.
  const selection = useTransactionSelection(
    `${id ?? ''}|${dayRange.from}|${dayRange.to}|${JSON.stringify(filters)}`,
  );
  // Selected rows resolved from the whole loaded window (not just the visible
  // page), so a cross-page selection still merges/links correctly.
  const selectedRows = useMemo(
    () => (data ?? []).filter((t) => selection.selectedIds.has(t.id)),
    [data, selection.selectedIds],
  );
  // Link acts on exactly two Completed rows. Cross-account linking returns with
  // the future all-accounts list; today both rows are on the viewed account.
  const canLink = selectedRows.length === 2 && selectedRows.every((t) => t.status === 'Completed');
  const mergeEligibility = selectedRows.length >= 2 ? checkMergeEligibility(selectedRows) : null;
  const canMerge = mergeEligibility?.eligible ?? false;
  const mergeDisabledReason =
    mergeEligibility && !mergeEligibility.eligible
      ? MERGE_INELIGIBILITY_MESSAGE[mergeEligibility.reason]
      : undefined;

  // Frozen snapshots of the selection at the moment a dialog opens, so mutating
  // the selection underneath cannot shift the dialog's target set.
  const [mergeSelection, setMergeSelection] = useState<TransactionResponse[] | null>(null);
  const [linkPair, setLinkPair] = useState<[TransactionResponse, TransactionResponse] | null>(null);

  const filtered = useMemo(
    () => applyTransactionFilters(data ?? [], filters, categoryNameById),
    [data, filters, categoryNameById],
  );
  const transactions = useMemo(() => data ?? [], [data]);
  // Reverse index (originalId → refund aggregate) built once from the loaded
  // window; used to badge refunded expense rows.
  const refundIndex = useMemo(() => buildRelationIndex(transactions, 'refund'), [transactions]);
  // Reverse index (counterpartId → aggregate) for outbound `associated` edges in
  // the loaded window; used to badge the counterpart (inbound) side of an
  // association.
  const assocIndex = useMemo(() => buildRelationIndex(transactions, 'associated'), [transactions]);
  // Loaded rows by id, so an association counterpart can be resolved to its
  // status (for the "(cancelled)" marker).
  const txById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  // Resolve refund income rows back to their original by id so the row can show
  // "refund of <description>"; falls back to a generic badge when the original
  // is outside the loaded window.
  const descriptionById = useMemo(
    () => new Map(transactions.map((t) => [t.id, t.description])),
    [transactions],
  );
  // Count of active filter facets, surfaced on the (collapsed) toggle so the
  // user knows filters are narrowing the list. The date window is a primary
  // range control rather than a filter, so it is excluded here.
  const activeFilterCount =
    (filters.description.trim() ? 1 : 0) +
    (filters.labelIds.length > 0 ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.contactId ? 1 : 0) +
    (filters.showCancelledFailed ? 1 : 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);
  // Header select-all reflects the current page only.
  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((pid) => selection.isSelected(pid));
  const somePageSelected = pageIds.some((pid) => selection.isSelected(pid));

  const updateFilters = (next: TransactionFilters) => {
    setFilters(next);
    setPageIndex(0);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchParams(periodParamsToSearch('last-month', presetRange('last-month', new Date())), {
      replace: true,
    });
    setPageIndex(0);
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

  const [refundTarget, setRefundTarget] = useState<TransactionResponse | null>(null);
  const openRefund = (t: TransactionResponse) => setRefundTarget(t);

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
    body = <EmptyState message="Select an account." />;
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
        <Alert variant="destructive" role="alert">
          <AlertDescription>Couldn&rsquo;t load transactions.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (!data || data.length === 0) {
    body = <EmptyState message="No transactions in this date range." />;
  } else if (filtered.length === 0) {
    body = <EmptyState message="No transactions match your filters." />;
  } else {
    body = (
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="w-8 px-2 py-2">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allPageSelected}
                ref={(el) => {
                  if (el) el.indeterminate = somePageSelected && !allPageSelected;
                }}
                onChange={() => selection.setMany(pageIds, !allPageSelected)}
              />
            </th>
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
                      selection.isSelected(t.id) && 'bg-muted',
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
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.description || 'transaction'}`}
                        checked={selection.isSelected(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={() => selection.toggle(t.id)}
                      />
                    </td>
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
                      {(() => {
                        // Per-allocation comments are the item-level "what exactly"; show
                        // them muted after the description. When the description is empty
                        // they become the primary text; when they exactly equal the
                        // description (common for NL-created rows) the tail is suppressed.
                        const comments = allocationComments(t).join(', ');
                        const showComments = comments !== '' && comments !== t.description;
                        const hasText = !!t.description || showComments;
                        // Origin side: this expense has refunds pointing at it.
                        const refundStat = refundIndex.get(t.id);
                        // Refund side: this row's own outbound refund edge.
                        const refundRel = t.relations.find((r) => r.relationKind === 'refund');
                        // Association edges to badge: the row's own outbound
                        // `associated` edges, plus inbound ones (a loaded row
                        // pointing at this one). Deduped by counterpart id.
                        const assocEdges = new Map<string, AssocEdge>();
                        for (const r of t.relations) {
                          if (r.relationKind !== 'associated') continue;
                          const cp = txById.get(r.relatedTransactionId);
                          assocEdges.set(r.relatedTransactionId, {
                            relatedTransactionId: r.relatedTransactionId,
                            description: descriptionById.get(r.relatedTransactionId),
                            counterpartCancelled: cp?.status === 'Cancelled',
                          });
                        }
                        // Inbound: this row is the target of another row's
                        // association. `assocIndex` proves an edge exists; scan
                        // the window to recover each owner (the counterpart).
                        if (assocIndex.has(t.id)) {
                          for (const owner of transactions) {
                            if (
                              owner.relations.some(
                                (r) =>
                                  r.relationKind === 'associated' &&
                                  r.relatedTransactionId === t.id,
                              )
                            ) {
                              if (!assocEdges.has(owner.id)) {
                                assocEdges.set(owner.id, {
                                  relatedTransactionId: owner.id,
                                  description: descriptionById.get(owner.id),
                                  counterpartCancelled: owner.status === 'Cancelled',
                                });
                              }
                            }
                          }
                        }
                        return (
                          <>
                            <span
                              className={cn(
                                // Trim long descriptions to keep the column
                                // narrow and the row single-line; the full text
                                // stays in the title tooltip. inline-block so
                                // labels/badges still flow after it.
                                'inline-block max-w-[34rem] truncate align-bottom',
                                deEmphasized && 'line-through',
                              )}
                              title={[t.description, showComments ? comments : '']
                                .filter(Boolean)
                                .join(' · ')}
                            >
                              {t.description}
                              {showComments && (
                                <span className="text-muted-foreground">
                                  {t.description ? ' · ' : ''}
                                  {comments}
                                </span>
                              )}
                            </span>
                            <LabelChips
                              labelIds={t.labels}
                              nameById={labelNameById}
                              leadingGap={hasText}
                            />
                            <ContactChip
                              contactId={t.contactId}
                              nameById={labelNameById}
                              leadingGap={hasText || t.labels.length > 0}
                            />
                            {refundStat && (
                              <RelationBadge
                                kind="refund"
                                mode="origin"
                                refundStat={refundStat}
                                originalTotal={t.allocations.expenses.reduce(
                                  (s, a) => s + a.amount.amount,
                                  0,
                                )}
                                currency={t.sourceCurrency}
                              />
                            )}
                            {refundRel && (
                              <RelationBadge
                                kind="refund"
                                mode="counterpart"
                                description={descriptionById.get(refundRel.relatedTransactionId)}
                              />
                            )}
                            <AssociationBadges actingId={t.id} edges={[...assocEdges.values()]} />
                          </>
                        );
                      })()}
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
                        !deEmphasized && negative && 'text-negative',
                        !deEmphasized && isIncome(t.transactionType) && 'text-positive',
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
                                  <Copy className="h-3.5 w-3.5" />
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
                                  <Ban className="h-3.5 w-3.5" />
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
                  {t.status === 'Completed' &&
                    (isIncome(t.transactionType) || isExpense(t.transactionType)) &&
                    allocationCategoryIds(t).length === 1 && (
                      <TxCategoryQuickPicker
                        options={
                          isIncome(t.transactionType)
                            ? incomeCategoryEntries
                            : expenseCategoryEntries
                        }
                        value={allocationCategoryIds(t)[0]}
                        onSelect={(categoryId) => assignCategory(t, categoryId)}
                      />
                    )}
                  {t.status === 'Completed' && (
                    <TxLabelQuickPicker
                      options={labelOptions}
                      value={t.labels}
                      onCommit={(labels) => commitLabels(t, labels)}
                      onCreate={(name) => createEntry('label', name)}
                    />
                  )}
                  {t.status === 'Completed' &&
                    (isIncome(t.transactionType) || isExpense(t.transactionType)) && (
                      <TxContactQuickPicker
                        options={contactOptions}
                        value={t.contactId}
                        onSelect={(id) => void commitContact(t, id)}
                        onCreate={(name) => createEntry('contact', name)}
                        createHint={t.description}
                      />
                    )}
                  {t.status === 'Completed' && t.transactionType === 'expense' && (
                    <ContextMenuItem onSelect={() => openRefund(t)}>
                      <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                      Refund
                    </ContextMenuItem>
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
        <div
          className={cn('flex items-center gap-3 px-3 py-2 text-sm', !filtersOpen && 'border-b')}
        >
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
              <Badge variant="count" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </button>
          <PeriodSelector
            presets={TX_PRESETS}
            value={periodValue}
            range={dayRange}
            onPresetChange={onPresetChange}
            onRangeChange={onRangeChange}
          />
        </div>
      )}
      {showFilterBar && filtersOpen && (
        <TransactionFilterBar
          filters={filters}
          labelOptions={labelOptions}
          categoryOptions={categoryOptions}
          contactOptions={contactOptions}
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
      {refundTarget && (
        <RefundTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setRefundTarget(null);
          }}
          original={refundTarget}
        />
      )}
      {linkPair && (
        <LinkTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setLinkPair(null);
          }}
          pair={linkPair}
          onLinked={() => selection.clear()}
        />
      )}
      {mergeSelection && (
        <MergeTransactionsDialog
          open
          onOpenChange={(o) => {
            if (!o) setMergeSelection(null);
          }}
          selected={mergeSelection}
          onMerged={() => selection.clear()}
        />
      )}
      <SelectionActionBar
        count={selection.count}
        canLink={canLink}
        canMerge={canMerge}
        mergeDisabledReason={mergeDisabledReason}
        onLink={() => {
          if (canLink) setLinkPair([selectedRows[0]!, selectedRows[1]!]);
        }}
        onMerge={() => {
          if (selectedRows.length >= 2) setMergeSelection(selectedRows);
        }}
        onClear={() => selection.clear()}
      />
    </>
  );
}
