import { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ApiError } from '@/api/client';
import type { BankConnectionDTO, ExternalAccountDTO, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { accountLabel } from '@/features/accounts/accountLabel';
import { useProviders } from '@/features/banking/useProviders';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useExternalAccounts } from '@/features/configuration/useExternalAccounts';
import { useExternalAccountsFromFile } from '@/features/configuration/useExternalAccountsFromFile';
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

// The external-account rows can come from two transports. Both resolve to the
// same shape so the row-rendering / selection / Save path below is identical.
interface RowSource {
  rows: ExternalAccountDTO[] | undefined;
  loading: boolean;
  error: unknown;
  // Retry the live pull; undefined for file providers (they re-pick a file).
  retry?: () => void;
  // Hand a picked statement to the file-discovery endpoint; undefined for pull.
  onPickFiles?: (files: File[]) => void;
}

export function LinkAccountsDialog({ open, onOpenChange, connection }: LinkAccountsDialogProps) {
  const { data: providers } = useProviders();
  const provider = providers?.find((p) => p.id === connection.provider);
  const supportsPull = provider?.supportsPull ?? false;
  const supportsFile = provider?.supportsFile ?? false;
  // A connection is treated as file-based only when it cannot pull; a
  // provider that supports both keeps the live pull transport here.
  const isFile = !supportsPull && supportsFile;

  const accounts = useAccounts();
  const setAccountMap = useSetAccountMap();
  const configuration = useConfiguration();

  // Local accounts already claimed by a DIFFERENT connection must not be
  // offered here — a local account may back at most one bank connection. Built
  // once from every OTHER connection's accountMap values; accounts unlinked or
  // mapped by THIS connection stay eligible.
  const linkedByOtherConnections = useMemo(() => {
    const claimed = new Set<string>();
    for (const c of configuration.data?.banking.connections ?? []) {
      if (c.id === connection.id) continue;
      for (const accountId of Object.values(c.accountMap)) claimed.add(accountId);
    }
    return claimed;
  }, [configuration.data, connection.id]);

  // Both transports are wired unconditionally (rules of hooks); only the one
  // matching the provider is exercised.
  const pull = useExternalAccounts(connection.id);
  const fromFile = useExternalAccountsFromFile();

  // Fetch the live listing whenever the dialog opens (lazy query) — pull only.
  const { refetch: pullRefetch } = pull;
  useEffect(() => {
    if (open && supportsPull) {
      void pullRefetch();
    }
  }, [open, supportsPull, pullRefetch]);

  const source: RowSource = isFile
    ? {
        rows: fromFile.data,
        loading: fromFile.isPending,
        error: fromFile.error,
        onPickFiles: (files) => fromFile.mutate({ connId: connection.id, format: 'csv', files }),
      }
    : {
        rows: pull.data,
        loading: pull.isFetching,
        error: pull.error,
        retry: () => void pull.refetch(),
      };

  const { rows, loading, error } = source;

  // externalId -> local accountId (or NOT_IMPORTED). Seeded from the
  // connection's current map once the external accounts arrive.
  const [selection, setSelection] = useState<Record<string, string>>({});

  // Seed the row selection from the current accountMap once data loads. A file
  // connection opens with an empty map, so this is a no-op until upload.
  useEffect(() => {
    if (!rows) return;
    setSelection(() => {
      const next: Record<string, string> = {};
      for (const acc of rows) {
        const mapped = connection.accountMap[acc.externalId];
        next[acc.externalId] = mapped ?? NOT_IMPORTED;
      }
      return next;
    });
  }, [rows, connection.accountMap]);

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

        {isFile && (
          <div className="space-y-1">
            <Label htmlFor="statement-files">Statement files</Label>
            <Input
              id="statement-files"
              type="file"
              multiple
              accept=".csv,text/csv"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) source.onPickFiles?.(files);
              }}
            />
            {!loading && !error && !rows && (
              <p className="text-xs text-muted-foreground">
                Upload your statement(s) to list accounts.
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!loading && error != null && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="space-y-3">
              <p>
                {isRateLimited(error)
                  ? `${provider?.displayName ?? 'The provider'} is rate-limited. Try again in a moment.`
                  : 'Couldn’t load external accounts. Please try again.'}
              </p>
              {source.retry && (
                <Button type="button" variant="outline" size="sm" onClick={source.retry}>
                  Try again
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!loading && !error && rows && (
          <div className="space-y-4">
            {saveError != null && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{saveErrorMessage}</AlertDescription>
              </Alert>
            )}

            {rows.map((acc) => {
              const value = selection[acc.externalId] ?? NOT_IMPORTED;
              const label = acc.iban;
              // Offered local accounts must be relevant to this connection:
              //  - same currency: the backend cannot post a transaction whose
              //    currency differs from its local account's currency;
              //  - a real bank account (not cash / asset / loan / eWallet);
              //  - not already claimed by another connection.
              const sameCurrency = (accounts.data ?? []).filter(
                (local) =>
                  local.currency.toUpperCase() === acc.currency.toUpperCase() &&
                  local.subtype?.type === 'bankAccount' &&
                  !linkedByOtherConnections.has(local.id),
              );
              // The row's current selection must stay selectable even when the
              // filters above would exclude it (e.g. a legacy non-bank mapping),
              // so re-opening the dialog never silently drops a valid mapping.
              const selected =
                value !== NOT_IMPORTED
                  ? (accounts.data ?? []).find((local) => local.id === value)
                  : undefined;
              const options =
                selected && !sameCurrency.some((local) => local.id === selected.id)
                  ? [...sameCurrency, selected]
                  : sameCurrency;
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
                      {/* The backend accountMap is many-to-one: sibling cards
                          (e.g. two PrivatBank cards) legitimately share one
                          local account, so a chosen account stays selectable in
                          every same-currency row. */}
                      {options.map((local) => (
                        <SelectItem key={local.id} value={local.id}>
                          {accountLabel(local, options)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {options.length === 0 && (
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
            disabled={loading || error != null || !rows || setAccountMap.isPending}
          >
            {setAccountMap.isPending ? 'Saving…' : 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
