import { useEffect, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ApiError } from '@/api/client';
import type { BankConnectionDTO, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useExternalAccounts } from '@/features/configuration/useExternalAccounts';
import { useSetAccountMap } from '@/features/configuration/useSetAccountMap';

export interface LinkAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: BankConnectionDTO;
}

// Radix `SelectItem` cannot use an empty-string value, so "not imported" gets
// its own sentinel; rows holding it are omitted from the saved `accountMap`.
const NOT_IMPORTED = '__not_imported__';

function isRateLimited(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.code === 'BANKING_RATE_LIMITED' || error.status === 429)
  );
}

export function LinkAccountsDialog({ open, onOpenChange, connection }: LinkAccountsDialogProps) {
  const external = useExternalAccounts(connection.id);
  const accounts = useAccounts();
  const setAccountMap = useSetAccountMap();

  // externalId -> local accountId (or NOT_IMPORTED). Seeded from the
  // connection's current map once the external accounts arrive.
  const [selection, setSelection] = useState<Record<string, string>>({});

  // Fetch the live monobank listing whenever the dialog opens (lazy query).
  const { refetch } = external;
  useEffect(() => {
    if (open) {
      void refetch();
    }
  }, [open, refetch]);

  const externalAccounts = external.data;

  // Seed the row selection from the current accountMap once data loads.
  useEffect(() => {
    if (!externalAccounts) return;
    setSelection(() => {
      const next: Record<string, string> = {};
      for (const acc of externalAccounts) {
        const mapped = connection.accountMap[acc.externalId];
        next[acc.externalId] = mapped ?? NOT_IMPORTED;
      }
      return next;
    });
  }, [externalAccounts, connection.accountMap]);

  const chosen = new Set(Object.values(selection).filter((v) => v !== NOT_IMPORTED));

  const handleSave = async () => {
    const accountMap: Record<string, UUID> = {};
    for (const [externalId, accountId] of Object.entries(selection)) {
      if (accountId !== NOT_IMPORTED) {
        accountMap[externalId] = accountId;
      }
    }
    try {
      await setAccountMap.mutateAsync({ id: connection.id, body: { accountMap } });
      onOpenChange(false);
    } catch {
      // Surfaced via the mutation-error Alert below.
    }
  };

  const saveError = setAccountMap.error;
  const saveErrorMessage =
    saveError instanceof ApiError ? saveError.message : 'Something went wrong. Please try again.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link accounts</DialogTitle>
          <DialogDescription>
            Map each external bank account to one of your local accounts.
          </DialogDescription>
        </DialogHeader>

        {external.isFetching && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!external.isFetching && external.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="space-y-3">
              <p>
                {isRateLimited(external.error)
                  ? 'monobank is rate-limited. Try again in a moment.'
                  : 'Couldn’t load external accounts. Please try again.'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void external.refetch();
                }}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!external.isFetching && !external.error && externalAccounts && (
          <div className="space-y-4">
            {saveError != null && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{saveErrorMessage}</AlertDescription>
              </Alert>
            )}

            {externalAccounts.map((acc) => {
              const value = selection[acc.externalId] ?? NOT_IMPORTED;
              const label = acc.iban;
              // The backend cannot post a transaction whose currency differs
              // from its local account's currency, so a monobank account may
              // only map to a same-currency local account.
              const sameCurrency = (accounts.data ?? []).filter(
                (local) => local.currency.toUpperCase() === acc.currency.toUpperCase(),
              );
              return (
                <div key={acc.externalId} className="space-y-1">
                  <div className="text-sm font-medium">{acc.iban}</div>
                  <div className="text-xs text-muted-foreground">
                    {acc.maskedPan ? `${acc.maskedPan} · ` : ''}
                    {acc.currency} · {acc.balance}
                  </div>
                  <Select
                    value={value}
                    onValueChange={(v) =>
                      setSelection((prev) => ({ ...prev, [acc.externalId]: v }))
                    }
                  >
                    <SelectTrigger aria-label={label}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_IMPORTED}>— not imported —</SelectItem>
                      {sameCurrency.map((local) => (
                        <SelectItem
                          key={local.id}
                          value={local.id}
                          // Prevent mapping the same local account to two
                          // external accounts: disable it everywhere except
                          // the row that already holds it.
                          disabled={chosen.has(local.id) && value !== local.id}
                        >
                          {local.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sameCurrency.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No {acc.currency} account — create one to import this card.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={
              external.isFetching ||
              external.error != null ||
              !externalAccounts ||
              setAccountMap.isPending
            }
          >
            {setAccountMap.isPending ? 'Saving…' : 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
