import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/api/client';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/api/types';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import {
  toCreateAccountRequest,
  type CreateAccountFormValues,
  type EditAccountFormValues,
} from './schema';
import { useCreateAccount } from './useCreateAccount';
import { AccountForm, type AccountFormApi } from './AccountForm';

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const navigate = useNavigate();
  const { data: config } = useConfiguration();
  const defaultCurrency: SupportedCurrency = (SUPPORTED_CURRENCIES as readonly string[]).includes(
    config?.defaultCurrency ?? '',
  )
    ? (config!.defaultCurrency as SupportedCurrency)
    : 'USD';

  const create = useCreateAccount();
  // Imperative handle to AccountForm: lets us push server-side field errors
  // and reveal the overdraft section without lifting RHF state up here.
  const formApiRef = useRef<AccountFormApi | null>(null);
  const handleReady = useCallback((api: AccountFormApi) => {
    formApiRef.current = api;
  }, []);

  const handleSubmit = async (values: CreateAccountFormValues | EditAccountFormValues) => {
    // mode='create' guarantees `values` is CreateAccountFormValues at runtime.
    const createValues = values as CreateAccountFormValues;
    try {
      const account = await create.mutateAsync(toCreateAccountRequest(createValues));
      onOpenChange(false);
      navigate(`/accounts/${account.id}`);
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

  const showBanner =
    create.isError && !(create.error instanceof ApiError && create.error.fieldErrors);
  const bannerMessage =
    create.error instanceof ApiError
      ? create.error.message
      : 'Something went wrong. Please try again.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>
            Add a new account to track balances and transactions.
          </DialogDescription>
        </DialogHeader>

        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}

        <AccountForm
          mode="create"
          defaultValues={{
            name: '',
            currency: defaultCurrency,
            initialBalance: 0,
            overdraftLimit: undefined,
            subtype: { type: 'cash' },
          }}
          isSubmitting={create.isPending}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          onReady={handleReady}
        />
      </DialogContent>
    </Dialog>
  );
}
