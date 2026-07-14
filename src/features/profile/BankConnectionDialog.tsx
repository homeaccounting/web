import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ApiError } from '@/api/client';
import type { BankConnectionDTO, UUID } from '@/api/types';
import { useAddConnection } from '@/features/configuration/useAddConnection';
import { useUpdateConnection } from '@/features/configuration/useUpdateConnection';
import { useChangeToken } from '@/features/configuration/useChangeToken';
import { useSetAccountMap } from '@/features/configuration/useSetAccountMap';
import { useProviders } from '@/features/banking/useProviders';
import { useAccounts } from '@/features/accounts/useAccounts';
import { AccountSelect } from './AccountSelect';
import {
  makeBankConnectionFormSchema,
  type BankConnectionFormValues,
} from './bankConnectionSchema';

// Single-account routing (tracker#38): a file-only connection maps every
// imported statement row to one local account, so the accountMap needs
// exactly one entry. The backend's single-account routing ignores the key but
// its validation rejects an empty one, so this is a stable non-empty
// placeholder rather than a real external account id.
const FILE_IMPORT_ACCOUNT_MAP_KEY = 'statement';

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

  const accountsQuery = useAccounts();

  const add = useAddConnection();
  const update = useUpdateConnection();
  const changeToken = useChangeToken();
  const setAccountMap = useSetAccountMap();

  // Data-integrity guard for the create + file-only path: `add` mints a fresh
  // connection with no backend dedup, so if the follow-up `setAccountMap`
  // fails, resubmitting must NOT call `add` again — it would create a SECOND
  // connection. Persisting the id here lets a retry skip straight to
  // `setAccountMap` on the same connection. Reset when a fresh create session
  // starts (dialog reopened) so a brand-new session never reuses a stale id.
  const [createdConnectionId, setCreatedConnectionId] = useState<UUID | undefined>(undefined);
  useEffect(() => {
    if (open) {
      setCreatedConnectionId(undefined);
    }
  }, [open]);

  const form = useForm<BankConnectionFormValues>({
    resolver: zodResolver(makeBankConnectionFormSchema(providerList, isEdit)),
    defaultValues: isEdit
      ? {
          name: connection.name,
          provider: connection.provider,
          token: '',
          enabled: connection.enabled,
          accountId: Object.values(connection.accountMap)[0] ?? '',
        }
      : { name: '', provider: '', token: '', enabled: true, accountId: '' },
  });

  // Selected provider's transport capabilities drive which fields the dialog
  // shows. Fail-soft (provider not found / list not loaded): treat it as a
  // pull provider, matching the pre-tracker#38 monobank-only behavior.
  const selectedProviderId = form.watch('provider');
  const selectedProvider = providerList.find((p) => p.id === selectedProviderId);
  const supportsPull = selectedProvider?.supportsPull ?? true;
  // A provider advertising BOTH pull and file is treated as pull-only in this
  // UI today (token required, no inline account picker) — a conscious
  // current-scope choice.
  const fileOnly = selectedProvider != null && selectedProvider.supportsFile && !supportsPull;

  const isSubmitting =
    add.isPending || update.isPending || changeToken.isPending || setAccountMap.isPending;

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
    const accountId = values.accountId ?? '';
    try {
      if (!isEdit) {
        if (fileOnly) {
          // Reuse the connection from a prior failed attempt instead of
          // calling `add` again — the backend has no dedup, so a resubmit
          // that re-ran `add` would mint a second connection every time
          // `setAccountMap` below keeps failing.
          let id = createdConnectionId;
          if (id === undefined) {
            const created = await add.mutateAsync({
              provider: values.provider,
              name: values.name,
              token: undefined,
              enabled: values.enabled,
            });
            id = created.id;
            // Persist BEFORE setAccountMap so a failure there still leaves
            // this retry-safe: the connection exists and is remembered even
            // though the overall submit is about to throw.
            setCreatedConnectionId(id);
          }
          // Surfaced via the mutation-error Alert below if it fails — the
          // connection now exists but is left unmapped, which is reported
          // rather than silently swallowed.
          await setAccountMap.mutateAsync({
            id,
            body: { accountMap: { [FILE_IMPORT_ACCOUNT_MAP_KEY]: accountId } },
          });
        } else {
          await add.mutateAsync({
            provider: values.provider,
            name: values.name,
            token,
            enabled: values.enabled,
          });
        }
      } else {
        await update.mutateAsync({
          id: connection.id,
          body: { name: values.name, enabled: values.enabled },
        });
        if (!fileOnly && token !== '') {
          await changeToken.mutateAsync({ id: connection.id, body: { token } });
        }
        if (fileOnly && accountId !== '') {
          await setAccountMap.mutateAsync({
            id: connection.id,
            body: { accountMap: { [FILE_IMPORT_ACCOUNT_MAP_KEY]: accountId } },
          });
        }
      }
      // Full success: clear the retry guard so a later fresh create session
      // (this dialog instance is reused across "Add connection" clicks)
      // doesn't mistakenly reuse this connection's id.
      setCreatedConnectionId(undefined);
      onOpenChange(false);
    } catch (e) {
      applyFieldErrors(e);
    }
  });

  const mutationError = add.error ?? update.error ?? changeToken.error ?? setAccountMap.error;
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
                  <FormLabel>Name</FormLabel>
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
                  <FormLabel>Provider</FormLabel>
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
                        {providerList.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.displayName}
                          </SelectItem>
                        ))}
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

            {fileOnly && (
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Import into account</FormLabel>
                    <FormControl>
                      <AccountSelect
                        label="Import into account"
                        value={field.value ?? ''}
                        accounts={accountsQuery.data ?? []}
                        includeNone={false}
                        placeholder="Select an account…"
                        onChange={field.onChange}
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
