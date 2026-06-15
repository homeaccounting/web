import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AccountResponse } from '@/api/types';
import { ACCOUNT_SUBTYPE_KINDS } from '@/api/types';
import { ApiError } from '@/api/client';
import { ACCOUNT_SUBTYPE_LABELS } from './labels';
import { useAccounts } from './useAccounts';
import { useAccountById } from './useAccountById';
import { CreateAccountDialog } from './CreateAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import { CloseAccountDialog } from './CloseAccountDialog';
import { AccountContextMenu } from './AccountContextMenu';
import { useReopenAccount } from './useAccountStatus';
import { SyncNowButton } from './SyncNowButton';
import { formatAccountBalance } from './format';

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const { id } = useParams<{ id?: string }>();
  const { data: selectedAccount } = useAccountById(id);
  const [creating, setCreating] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountResponse | null>(null);
  const [closingAccount, setClosingAccount] = useState<AccountResponse | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [reopenError, setReopenError] = useState<string | null>(null);
  const reopenMutation = useReopenAccount();
  const accountActionsDisabled = !selectedAccount;

  const reopen = (account: AccountResponse) => {
    setReopenError(null);
    reopenMutation.mutate(
      { id: account.id },
      {
        onError: (err) =>
          setReopenError(
            err instanceof ApiError ? err.message : 'Could not reopen this account. Try again.',
          ),
      },
    );
  };

  const openAccounts = data?.filter((a) => a.status !== 'Closed') ?? [];
  const closedAccounts = data?.filter((a) => a.status === 'Closed') ?? [];
  const selectedIsClosed = selectedAccount?.status === 'Closed';

  // Group open accounts by subtype, ordered by the canonical subtype list;
  // accounts without a (known) subtype fall into a trailing "Other" group.
  // Empty groups are omitted.
  const openGroups: { key: string; label: string; accounts: AccountResponse[] }[] = [
    ...ACCOUNT_SUBTYPE_KINDS.map((kind) => ({
      key: kind,
      label: ACCOUNT_SUBTYPE_LABELS[kind],
      accounts: openAccounts.filter((a) => a.subtype?.type === kind),
    })),
    {
      key: 'other',
      label: 'Other',
      accounts: openAccounts.filter(
        (a) => !a.subtype || !ACCOUNT_SUBTYPE_KINDS.includes(a.subtype.type as never),
      ),
    },
  ].filter((g) => g.accounts.length > 0);

  const renderAccountRow = (a: AccountResponse) => {
    const isClosed = a.status === 'Closed';
    return (
      <AccountContextMenu
        account={a}
        onRequestEdit={setEditingAccount}
        onRequestClose={setClosingAccount}
        onRequestReopen={reopen}
      >
        <NavLink
          to={`/accounts/${a.id}`}
          onDoubleClick={() => setEditingAccount(a)}
          className={cn(
            // Static (non-function) className: this NavLink is cloned by Radix's
            // ContextMenuTrigger `asChild` Slot, which does not resolve a
            // function-form className — so the active state uses the
            // `aria-current` attribute NavLink sets, via a Tailwind variant.
            'flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted',
            'aria-[current=page]:bg-muted aria-[current=page]:font-medium',
            isClosed && 'opacity-60',
          )}
        >
          <span className="truncate">{a.name}</span>
          <span className="tabular-nums">{formatAccountBalance(a)}</span>
        </NavLink>
      </AccountContextMenu>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Accounts</span>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit account"
                  disabled={accountActionsDisabled}
                  onClick={() => selectedAccount && setEditingAccount(selectedAccount)}
                  className="h-9 w-9"
                >
                  <Pencil className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit account</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={selectedIsClosed ? 'Reopen account' : 'Close account'}
                  disabled={accountActionsDisabled || reopenMutation.isPending}
                  onClick={() =>
                    selectedAccount &&
                    (selectedIsClosed
                      ? reopen(selectedAccount)
                      : setClosingAccount(selectedAccount))
                  }
                  className="h-9 w-9"
                >
                  {selectedIsClosed ? (
                    <ArchiveRestore className="h-5 w-5" />
                  ) : (
                    <Archive className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedIsClosed ? 'Reopen account' : 'Close account'}
              </TooltipContent>
            </Tooltip>
            <SyncNowButton selectedAccount={selectedAccount} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Add account"
                  onClick={() => setCreating(true)}
                  className="h-9 w-9"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add account</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {isLoading && (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="space-y-2 p-3">
          <Alert role="alert" variant="destructive">
            <AlertDescription>Could not load accounts.</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <div className="p-3">
          <span className="text-sm text-muted-foreground">No accounts yet.</span>
        </div>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="p-2">
          {openGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="mb-2 last:mb-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-1 rounded-md px-2 pb-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {collapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {group.label}
                </button>
                {!collapsed && (
                  <ul className="space-y-0.5">
                    {group.accounts.map((a) => (
                      <li key={a.id}>{renderAccountRow(a)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {closedAccounts.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="mt-2 px-2 text-xs text-muted-foreground hover:underline"
              >
                {showClosed ? 'Hide closed' : `Show closed (${closedAccounts.length})`}
              </button>
              {showClosed && (
                <ul className="mt-1 space-y-0.5 border-t pt-2">
                  {closedAccounts.map((a) => (
                    <li key={a.id}>{renderAccountRow(a)}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
      {editingAccount && (
        <EditAccountDialog
          open
          onOpenChange={(next) => {
            if (!next) setEditingAccount(null);
          }}
          account={editingAccount}
        />
      )}
      {closingAccount && (
        <CloseAccountDialog
          open
          onOpenChange={(next) => {
            if (!next) setClosingAccount(null);
          }}
          account={closingAccount}
        />
      )}
      {reopenError && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
          <Alert role="alert" variant="destructive" className="relative pr-9 shadow-lg">
            <AlertDescription>{reopenError}</AlertDescription>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setReopenError(null)}
              className="absolute right-2 top-2 rounded-sm opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </Alert>
        </div>
      )}
    </>
  );
}
