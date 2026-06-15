import { ApiError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { TransactionResponse } from '@/api/types';
import { useCancelTransaction } from './useCancelTransaction';

export interface CancelTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionResponse;
}

// Confirmation for the irreversible (via UI) cancel. Errors surface inline and
// keep the dialog open — the app has no global toast — matching the inline
// banner pattern in EditTransactionDialog.
export function CancelTransactionDialog({
  open,
  onOpenChange,
  transaction,
}: CancelTransactionDialogProps) {
  const cancel = useCancelTransaction();
  const accountIds = [...new Set([transaction.sourceAccountId, transaction.targetAccountId])];

  const showBanner = cancel.isError;
  const bannerMessage =
    cancel.error instanceof ApiError
      ? cancel.error.message
      : 'Something went wrong. Please try again.';

  const onConfirm = async () => {
    try {
      await cancel.mutateAsync({ id: transaction.id, accountIds });
      onOpenChange(false);
    } catch {
      // Surfaced via the inline banner above; keep the dialog open.
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (cancel.isPending) return;
        if (!next) cancel.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            It will be excluded from the account balance and hidden from the default transactions
            list. This can&apos;t be undone here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => onOpenChange(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => void onConfirm()}
          >
            OK
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
