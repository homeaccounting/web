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
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import {
  fromAccountResponse,
  type CreateAccountFormValues,
  type EditAccountFormValues,
} from './schema';
import { diffAccount } from './diffAccount';
import { useEditAccount } from './useEditAccount';
import { AccountForm, type AccountFormApi } from './AccountForm';

export interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

export function EditAccountDialog({ open, onOpenChange, account }: EditAccountDialogProps) {
  const queryClient = useQueryClient();
  const edit = useEditAccount(account.id);
  // Re-derives the diff baseline each time a sub-call applies. Bumping this
  // counter causes useMemo to re-read the cache and pick up the freshly-
  // patched account row. The inner form is NOT remounted: that would wipe
  // in-flight user edits to fields whose sub-calls haven't been attempted
  // (or have just failed), breaking the partial-save UX where a retry
  // should re-send only what's still pending.
  const [editEpoch, setEditEpoch] = useState(0);

  const onSubCallApplied = useCallback(() => {
    setEditEpoch((n) => n + 1);
  }, []);

  // Resolve the freshest version of the account each time editEpoch ticks:
  // the cache row patched by useEditAccount when available, falling back to
  // the prop passed in by the caller. We deliberately read via
  // `getQueryData` rather than subscribing via `useAccountById` — a
  // subscribe would re-render the form whenever an unrelated refetch lands
  // and could clobber the diff baseline with the canonical server response
  // mid-edit.
  const currentAccount = useMemo(() => {
    const cached = queryClient
      .getQueryData<AccountResponse[]>(['accounts'])
      ?.find((a) => a.id === account.id);
    return cached ?? account;
    // editEpoch participates in the dep list so each sub-call rerun picks up
    // the freshly-patched cache row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, account, editEpoch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Update account details.</DialogDescription>
        </DialogHeader>
        <EditAccountForm
          account={currentAccount}
          edit={edit}
          onSubCallApplied={onSubCallApplied}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditAccountForm({
  account,
  edit,
  onSubCallApplied,
  onClose,
}: {
  account: AccountResponse;
  edit: ReturnType<typeof useEditAccount>;
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  // Defaults seed RHF on initial mount (subsequent recomputations don't
  // re-seed the form). The dialog deliberately keeps the inner form mounted
  // across sub-call boundaries so in-flight user edits to fields that
  // haven't (yet) committed are preserved on retry.
  const defaultValues = useMemo(() => fromAccountResponse(account), [account]);
  // The diff baseline must follow the freshest `account` (which the parent
  // re-reads from the cache after every applied sub-call). A ref lets
  // handleSubmit's closure pick up the new baseline without participating
  // in React's render-time dependency tracking.
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;
  const formApiRef = useRef<AccountFormApi | null>(null);
  const handleReady = useCallback((api: AccountFormApi) => {
    formApiRef.current = api;
  }, []);

  // Show a banner when the last attempt failed with a non-field error
  // (e.g. 500, or a partial-save where the failing sub-call didn't return
  // fieldErrors).
  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  const handleSubmit = async (values: CreateAccountFormValues | EditAccountFormValues) => {
    // mode='edit' guarantees `values` is EditAccountFormValues at runtime,
    // and CreateAccountFormValues is structurally assignable to it.
    try {
      const diff = diffAccount(baselineRef.current, values);
      await edit.mutateAsync({ diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          formApiRef.current?.setFieldError(field, message);
        }
        if ('overdraftLimit' in e.fieldErrors) {
          formApiRef.current?.revealAdvanced();
        }
      }
    }
  };

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <AccountForm
        mode="edit"
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}
