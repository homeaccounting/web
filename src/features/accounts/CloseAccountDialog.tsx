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
import type { AccountResponse } from '@/api/types';
import { useCloseAccount } from './useAccountStatus';

export interface CloseAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

// Confirmation for closing (hiding) an account. Errors surface inline and keep
// the dialog open — the app has no global toast — mirroring CancelTransactionDialog.
// Closing is reversible via Reopen, so the copy reassures rather than warns.
export function CloseAccountDialog({ open, onOpenChange, account }: CloseAccountDialogProps) {
  const { t } = useTranslation('accounts');
  const close = useCloseAccount();

  const showBanner = close.isError;
  const bannerMessage =
    close.error instanceof ApiError ? close.error.message : t('errors.generic');

  const onConfirm = async () => {
    try {
      await close.mutateAsync({ id: account.id });
      onOpenChange(false);
    } catch {
      // Surfaced via the inline banner above; keep the dialog open.
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (close.isPending) return;
        if (!next) close.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('closeDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('closeDialog.description', { name: account.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button variant="outline" disabled={close.isPending} onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button variant="default" disabled={close.isPending} onClick={() => void onConfirm()}>
            {t('common:ok')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
