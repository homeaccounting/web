import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('transactions');
  const cancel = useCancelTransaction();
  const accountIds = [...new Set([transaction.sourceAccountId, transaction.targetAccountId])];

  const showBanner = cancel.isError;
  const bannerMessage =
    cancel.error instanceof ApiError ? cancel.error.message : t('resolve.genericError');

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
          <AlertDialogTitle>{t('resolve.cancelTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('resolve.cancelDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => onOpenChange(false)}>
            {t('resolve.keep')}
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => void onConfirm()}
          >
            {t('common:ok')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
