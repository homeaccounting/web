import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectTrigger, SelectValue, SelectContent } from '@/components/ui/select';
import { renderProviderOptions } from '@/features/banking/renderProviderOptions';
import { ApiError } from '@/api/client';
import type { BankConnectionDTO } from '@/api/types';
import { useAddConnection } from '@/features/configuration/useAddConnection';
import { useUpdateConnection } from '@/features/configuration/useUpdateConnection';
import { useChangeToken } from '@/features/configuration/useChangeToken';
import { useProviders } from '@/features/banking/useProviders';
import { RequiredMarker } from '@/components/RequiredMarker';
import {
  makeBankConnectionFormSchema,
  type BankConnectionFormValues,
} from './bankConnectionSchema';

export interface BankConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Absent => create mode; present => edit mode.
  connection?: BankConnectionDTO;
}

export function BankConnectionDialog({
  open,
  onOpenChange,
  connection,
}: BankConnectionDialogProps) {
  const isEdit = connection !== undefined;

  const providersQuery = useProviders();
  const providerList = providersQuery.data ?? [];
  // Create-mode fail-soft: the provider Select has nothing to offer while the
  // list hasn't loaded (or errored) — the dialog stays open, just not
  // submittable, rather than falling back to a hardcoded provider.
  const providersUnavailable = !isEdit && providerList.length === 0;

  const add = useAddConnection();
  const update = useUpdateConnection();
  const changeToken = useChangeToken();

  const form = useForm<BankConnectionFormValues>({
    resolver: zodResolver(makeBankConnectionFormSchema(providerList, isEdit)),
    defaultValues: isEdit
      ? {
          name: connection.name,
          provider: connection.provider,
          token: '',
          enabled: connection.enabled,
        }
      : { name: '', provider: '', token: '', enabled: true },
  });

  // Selected provider's transport capabilities drive which fields the dialog
  // shows. Fail-soft (provider not found / list not loaded): treat it as a
  // pull provider, matching the pre-tracker#38 monobank-only behavior.
  const selectedProviderId = form.watch('provider');
  const selectedProvider = providerList.find((p) => p.id === selectedProviderId);
  const supportsPull = selectedProvider?.supportsPull ?? true;

  const isSubmitting = add.isPending || update.isPending || changeToken.isPending;

  const applyFieldErrors = (e: unknown): boolean => {
    if (e instanceof ApiError && e.fieldErrors) {
      for (const [field, message] of Object.entries(e.fieldErrors)) {
        // Field names from the backend (`name`, `token`, …) are valid keys of
        // the form values; the cast keeps RHF's strict typing happy.
        form.setError(field as 'name', { type: 'server', message });
      }
      return true;
    }
    return false;
  };

  const submit = form.handleSubmit(async (values) => {
    const token = values.token?.trim() ?? '';
    try {
      if (!isEdit) {
        // File connections are created unmapped: their accountMap is built
        // afterwards via "Link accounts". File-only providers show no token
        // field, so `token` is '' for them — omit it so the request carries no
        // credential (the field is optional server-side).
        await add.mutateAsync({
          provider: values.provider,
          name: values.name,
          token: token === '' ? undefined : token,
          enabled: values.enabled,
        });
      } else {
        await update.mutateAsync({
          id: connection.id,
          body: { name: values.name, enabled: values.enabled },
        });
        if (token !== '') {
          await changeToken.mutateAsync({ id: connection.id, body: { token } });
        }
      }
      onOpenChange(false);
    } catch (e) {
      applyFieldErrors(e);
    }
  });

  const mutationError = add.error ?? update.error ?? changeToken.error;
  const showBanner =
    mutationError != null && !(mutationError instanceof ApiError && mutationError.fieldErrors);
  const bannerMessage =
    mutationError instanceof ApiError
      ? mutationError.message
      : 'Something went wrong. Please try again.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit bank connection' : 'Add bank connection'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this connection. Leave the token blank to keep the current one.'
              : 'Connect a bank to import transactions automatically.'}
          </DialogDescription>
        </DialogHeader>

        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}

        <FormProvider {...form}>
          <form
            onSubmit={(e) => {
              void submit(e);
            }}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Name
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Provider
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    {/* Provider is immutable once a connection exists, so the
                        Select stays disabled in edit mode — it's still
                        populated from the real list so it can show the
                        connection's display name rather than a raw id. */}
                    <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                      <SelectTrigger aria-label="Provider">
                        <SelectValue placeholder="Select a provider…" />
                      </SelectTrigger>
                      <SelectContent>
                        {renderProviderOptions(providerList, (p) => p.id)}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  {providersUnavailable && (
                    <p className="text-sm text-muted-foreground">
                      No bank providers available. Try again later.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {supportsPull && (
              <FormField
                control={form.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder={isEdit ? '•••• kept' : undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>Enabled</FormLabel>
                  <FormControl>
                    <Switch
                      aria-label="Enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || providersUnavailable}>
                {isSubmitting ? 'Saving…' : 'OK'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
