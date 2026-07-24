import { useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/api/client';
import type { UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { nowDateTimeInput } from '@/lib/dates';
import { TransferForm, type TransferFormApi } from './TransferForm';
import { useCreateTransfer } from './useCreateTransfer';
import { toTransferRequest, type TransferFormValues } from './schema';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface CreateTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: UUID;
}

export function CreateTransferDialog({
  open,
  onOpenChange,
  selectedAccountId,
}: CreateTransferDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const create = useCreateTransfer();

  const labels = flattenDictionary(config?.dictionaries.label);

  const sourceAccount = accounts?.find((a) => a.id === selectedAccountId) ?? accounts?.[0];
  const sourceAccountId = sourceAccount?.id ?? '';
  const targetAccount = accounts?.find((a) => a.id !== sourceAccountId);

  const defaults = useMemo(
    () => ({
      sourceAccountId,
      targetAccountId: targetAccount?.id ?? '',
      amount: 0,
      currency: sourceAccount?.currency ?? '',
      description: '',
      exchangeRate: undefined,
      date: nowDateTimeInput(),
      labels: [] as UUID[],
    }),
    [sourceAccountId, targetAccount?.id, sourceAccount?.currency],
  );

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    const source = accounts!.find((a) => a.id === values.sourceAccountId);
    const target = accounts!.find((a) => a.id === values.targetAccountId);
    if (!source || !target) return; // schema guards make this unreachable
    try {
      await create.mutateAsync(toTransferRequest(values, source.currency, target.currency));
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          apiRef.current?.setFieldError(field, message);
        }
      }
    }
  };

  const showBanner =
    create.isError && !(create.error instanceof ApiError && create.error.fieldErrors);
  const bannerMessage =
    create.error instanceof ApiError
      ? create.error.message
      : 'Something went wrong. Please try again.';

  const hasEnoughAccounts = accounts && accounts.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{TRANSACTION_KIND_LABELS.transfer.title}</DialogTitle>
          <DialogDescription>Transfer funds between two of your accounts.</DialogDescription>
        </DialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        {hasEnoughAccounts && (
          <TransferForm
            mode="create"
            enforceBalance
            accounts={accounts}
            labels={labels}
            defaultValues={defaults}
            isSubmitting={create.isPending}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            onReady={handleReady}
          />
        )}
        {!hasEnoughAccounts && (
          <div className="p-2 text-sm text-muted-foreground">
            Create at least two accounts first to make a transfer.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
