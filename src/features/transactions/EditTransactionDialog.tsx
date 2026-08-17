import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/api/client';
import type {
  AccountResponse,
  Allocation,
  Allocations,
  TransactionResponse,
  UUID,
} from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useCreateDictionaryEntry } from '@/features/configuration/useCreateDictionaryEntry';
import { useUpdateBanking } from '@/features/configuration/useUpdateBanking';
import { ContactCombobox } from './ContactCombobox';
import { CategoryCombobox } from './CategoryCombobox';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import {
  toIncomeExpenseFormValues,
  toTransferFormValues,
  type IncomeExpenseFormValues,
  type TransferFormValues,
} from './schema';
import { diffIncomeExpense, diffTransfer } from './diffTransaction';
import { useEditTransaction } from './useEditTransaction';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';
import { isAdjustment, isIncome, isTransfer, transactionKind } from './transactionType';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

export interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
}

export function EditTransactionDialog({ open, onOpenChange, tx }: EditTransactionDialogProps) {
  const queryClient = useQueryClient();
  const edit = useEditTransaction();
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const [editEpoch, setEditEpoch] = useState(0);
  const onSubCallApplied = useCallback(() => setEditEpoch((n) => n + 1), []);

  const transfer = isTransfer(tx.transactionType);
  // Adjustments are booked External -> regular account (or vice versa) in the
  // base currency on the External leg; they have no category and the backend
  // cannot amend them (Commands.hs "Adjustment is out of scope"). They must
  // not open the income/expense edit form.
  const adjustment = isAdjustment(tx.transactionType);
  const income = isIncome(tx.transactionType);
  const kind: TransactionKind = transactionKind(tx.transactionType);

  const accountIds = useMemo<UUID[]>(
    () =>
      transfer || adjustment
        ? [tx.sourceAccountId, tx.targetAccountId]
        : [income ? tx.targetAccountId : tx.sourceAccountId],
    [transfer, adjustment, income, tx.sourceAccountId, tx.targetAccountId],
  );

  const currentTx = useMemo<TransactionResponse>(() => {
    for (const acc of accountIds) {
      const list = queryClient.getQueryData<TransactionResponse[]>(['transactions', acc]);
      const cached = list?.find((t) => t.id === tx.id);
      if (cached) return cached;
    }
    return tx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tx, editEpoch]);

  const title = adjustment ? 'Balance adjustment' : TRANSACTION_KIND_LABELS[kind].editTitle;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Inline "map to contact" for the imported provider token — curates the
  // global provider-token → contact map for future imports (tracker#54) AND
  // applies the chosen contact to this transaction, since mapping a token the
  // user is looking at is also a statement about the transaction in front of
  // them (see the mapTo closures below).
  const updateBanking = useUpdateBanking();
  const createContact = useCreateDictionaryEntry();
  const contacts = flattenDictionary(config?.dictionaries.contact);
  // Inline "map to category" for an imported counterparty category signal
  // (tracker#55). Income has no MCC/label, so income counterparties would
  // otherwise land on the income default; this curates the per-direction
  // provider-category → category map for future imports AND applies the chosen
  // category to this transaction when it is a single-slice import (a multi-slice
  // split is left untouched). The map is chosen by the transaction's direction
  // (income vs expense), exactly as resolveCategory does on the backend.
  const expenseCategories = flattenDictionary(config?.dictionaries.expense);
  const incomeCategories = flattenDictionary(config?.dictionaries.income);

  let body: React.ReactNode;
  if (currentTx.status !== 'Completed') {
    body = <ReadOnlyNotice status={currentTx.status} onClose={close} />;
  } else if (adjustment) {
    // Adjustments are not editable; TransactionsPane.openEdit prevents this
    // dialog from opening for them. Render nothing defensively rather than
    // falling through to the income/expense edit form.
    body = null;
  } else if (!accounts) {
    // Wait for accounts to load: react-hook-form seeds defaultValues once and
    // does not re-init when they change, so mounting the form against an empty
    // account list would leave the picker empty for the dialog's lifetime.
    body = <BodyLoader />;
  } else if (transfer) {
    body = (
      <EditTransferBody
        tx={currentTx}
        edit={edit}
        accountIds={accountIds}
        accounts={accounts}
        config={config}
        onSubCallApplied={onSubCallApplied}
        onClose={close}
      />
    );
  } else {
    body = (
      <EditIncomeExpenseBody
        tx={currentTx}
        edit={edit}
        kind={kind as 'income' | 'expense'}
        accountIds={accountIds}
        accounts={accounts}
        config={config}
        onSubCallApplied={onSubCallApplied}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Update transaction details.</DialogDescription>
        </DialogHeader>
        {body}
        {/* Import provenance is secondary metadata — keep it below the form,
            de-emphasised, not competing with the edit fields for attention. */}
        {(currentTx.bankProviderCategory || currentTx.bankProviderContact) && (
          <div className="mt-2 space-y-1 border-t pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Import details
            </p>
            {currentTx.bankProviderCategory &&
              (() => {
                const sig = currentTx.bankProviderCategory;
                // MCC / label are read-only provenance — they resolve through
                // the expense category map editor in Profile → Banking. Only the
                // counterparty signal gets an inline mapper here (tracker#55).
                if (sig.kind !== 'counterparty') {
                  return (
                    <p className="text-xs text-muted-foreground">
                      {sig.kind === 'mcc' ? 'MCC' : 'Category'}{' '}
                      <span
                        className="select-all font-mono"
                        title={
                          sig.kind === 'mcc'
                            ? 'Merchant category code from the bank'
                            : "Provider's own category label"
                        }
                      >
                        {sig.value}
                      </span>
                    </p>
                  );
                }
                const token = sig.value;
                const map = income
                  ? config?.banking.incomeCategoryMap
                  : config?.banking.expenseCategoryMap;
                const categories = income ? incomeCategories : expenseCategories;
                // Key form shared with the backend map keys (tracker#55,
                // renderBankProviderCategoryKey): `"counterparty:<token>"`.
                const key = `counterparty:${token}`;
                const readOnly = (suffix?: string) => (
                  <p className="text-xs text-muted-foreground">
                    Counterparty category{' '}
                    <span className="select-all font-mono" title="Counterparty token from the bank">
                      {token}
                    </span>
                    {suffix}
                  </p>
                );
                // Config not yet loaded: show the token, no mapper (can't merge
                // into an unknown map).
                if (!map) return readOnly();
                const mappedId = map[key];
                if (mappedId) {
                  const name = categories.find((x) => x.id === mappedId)?.name;
                  return readOnly(` → ${name ?? 'mapped category'}`);
                }
                const mapTo = (id: UUID) => {
                  updateBanking.mutate(
                    income
                      ? { incomeCategoryMap: { ...map, [key]: id } }
                      : { expenseCategoryMap: { ...map, [key]: id } },
                  );
                  // Also apply the chosen category to THIS transaction, but only
                  // when it is a single-slice import — rewriting a multi-slice
                  // split to one category would silently collapse a deliberate
                  // allocation, so for those we curate the map only. The total is
                  // unchanged (only categoryId moves), so this goes through the
                  // dedicated PATCH /allocations path (diffTransaction re-split).
                  const alloc = currentTx.allocations;
                  const singleSlice = alloc.incomes.length + alloc.expenses.length === 1;
                  if (singleSlice) {
                    const rebucket = (slices: Allocation[]) =>
                      slices.map((s) => ({ ...s, categoryId: id }));
                    const newAllocations: Allocations = income
                      ? { incomes: rebucket(alloc.incomes), expenses: alloc.expenses }
                      : { incomes: alloc.incomes, expenses: rebucket(alloc.expenses) };
                    edit.mutate({
                      id: currentTx.id,
                      accountIds,
                      diff: { allocations: newAllocations },
                      onSubCallApplied,
                    });
                  }
                };
                return (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Counterparty category</span>
                    <span className="select-all font-mono">{token}</span>
                    <div className="w-56">
                      <CategoryCombobox
                        options={categories}
                        value=""
                        onChange={(id) => mapTo(id)}
                        placeholder="Map to category…"
                        aria-label="Map to category"
                      />
                    </div>
                  </div>
                );
              })()}
            {currentTx.bankProviderContact &&
              (() => {
                const token = currentTx.bankProviderContact;
                const map = config?.banking.contactMap;
                const readOnly = (suffix?: string) => (
                  <p className="text-xs text-muted-foreground">
                    Counterparty{' '}
                    <span className="select-all font-mono" title="Counterparty token from the bank">
                      {token}
                    </span>
                    {suffix}
                  </p>
                );
                // Config not yet loaded: show the token, no mapper (can't merge
                // into an unknown map).
                if (!map) return readOnly();
                const mappedId = map[token];
                if (mappedId) {
                  const name = contacts.find((x) => x.id === mappedId)?.name;
                  return readOnly(` → ${name ?? 'mapped contact'}`);
                }
                const mapTo = (id: UUID) => {
                  updateBanking.mutate({ contactMap: { ...map, [token]: id } });
                  // Apply the chosen contact to THIS transaction too, via the
                  // dedicated setContact path (diff.contactId).
                  edit.mutate({
                    id: currentTx.id,
                    accountIds,
                    diff: { contactId: id },
                    onSubCallApplied,
                  });
                };
                return (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Counterparty</span>
                    <span className="select-all font-mono">{token}</span>
                    <div className="w-56">
                      <ContactCombobox
                        options={contacts}
                        value={null}
                        onChange={(id) => {
                          if (id) mapTo(id);
                        }}
                        onCreate={async (name) => {
                          const r = await createContact.mutateAsync({
                            dictId: 'contact',
                            name,
                            dict: config?.dictionaries.contact,
                          });
                          mapTo(r.id);
                        }}
                        placeholder="Map to contact…"
                        aria-label="Map to contact"
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyNotice({ status, onClose }: { status: string; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <Alert role="alert">
        <AlertDescription>This transaction is {status} and cannot be edited.</AlertDescription>
      </Alert>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          OK
        </Button>
      </div>
    </div>
  );
}

function BodyLoader() {
  return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

type Configuration = ReturnType<typeof useConfiguration>['data'];

function EditIncomeExpenseBody({
  tx,
  edit,
  kind,
  accountIds,
  accounts,
  config,
  onSubCallApplied,
  onClose,
}: {
  tx: TransactionResponse;
  edit: ReturnType<typeof useEditTransaction>;
  kind: 'income' | 'expense';
  accountIds: UUID[];
  accounts: AccountResponse[];
  config: Configuration;
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const seedCurrency = kind === 'income' ? tx.targetCurrency : tx.sourceCurrency;
  const filteredAccounts = useMemo(
    () => accounts.filter((a) => a.currency === seedCurrency),
    [accounts, seedCurrency],
  );

  const categoryDictId = kind === 'income' ? 'income' : 'expense';
  const categories = flattenDictionary(config?.dictionaries[categoryDictId]);
  const reimbursementCategories = flattenDictionary(config?.dictionaries['expense']);
  const labels = flattenDictionary(config?.dictionaries.label);
  const contacts = flattenDictionary(config?.dictionaries.contact);
  const createContact = useCreateDictionaryEntry();

  const defaultValues = useMemo(() => toIncomeExpenseFormValues(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  // Track whether the last failure had field errors that all mapped to a real
  // form field. When a categorised amend rejects with bucket-level errors
  // (sourceAmount/targetAmount/newAllocations/allocations) the mapper returns
  // null for every entry, so none can be surfaced inline — fall back to the
  // banner instead of silently swallowing the error.
  const [unmappedError, setUnmappedError] = useState(false);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    setUnmappedError(false);
    try {
      const diff = diffIncomeExpense(baselineRef.current, values, tx);
      await edit.mutateAsync({ id: tx.id, accountIds, diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        let mappedAny = false;
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapIncomeExpenseFieldError(field, kind);
          if (target) {
            apiRef.current?.setFieldError(target, message);
            mappedAny = true;
          }
        }
        if (!mappedAny) setUnmappedError(true);
      }
    }
  };

  const showBanner =
    edit.isError && (!(edit.error instanceof ApiError && edit.error.fieldErrors) || unmappedError);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <IncomeExpenseForm
        kind={kind}
        mode="edit"
        accounts={filteredAccounts}
        categories={categories}
        reimbursementCategories={reimbursementCategories}
        labels={labels}
        contacts={contacts}
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onCreateContact={(name) =>
          createContact
            .mutateAsync({ dictId: 'contact', name, dict: config?.dictionaries.contact })
            .then((r) => r.id)
        }
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function EditTransferBody({
  tx,
  edit,
  accountIds,
  accounts,
  config,
  onSubCallApplied,
  onClose,
}: {
  tx: TransactionResponse;
  edit: ReturnType<typeof useEditTransaction>;
  accountIds: UUID[];
  accounts: AccountResponse[];
  config: Configuration;
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const labels = flattenDictionary(config?.dictionaries.label);

  const defaultValues = useMemo(() => toTransferFormValues(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    try {
      const diff = diffTransfer(baselineRef.current, values, tx);
      await edit.mutateAsync({ id: tx.id, accountIds, diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapTransferFieldError(field);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <TransferForm
        mode="edit"
        accounts={accounts}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}
