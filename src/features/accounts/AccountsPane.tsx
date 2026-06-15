import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, Plus, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AccountResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import { useAccounts } from './useAccounts';
import { useAccountById } from './useAccountById';
import { CreateAccountDialog } from './CreateAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import { CloseAccountDialog } from './CloseAccountDialog';
import { AccountContextMenu } from './AccountContextMenu';
import { useReopenAccount } from './useAccountStatus';
import { SyncNowButton } from './SyncNowButton';
import { formatAccountBalance, formatAccountSubtypeLabel } from './format';

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const { id } = useParams<{ id?: string }>();
  const { data: selectedAccount } = useAccountById(id);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [closingAccount, setClosingAccount] = useState<AccountResponse | null>(null);
  const [showClosed, setShowClosed] = useState(false);
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

  const renderAccountRow = (a: AccountResponse) => {
    const isClosed = a.status === 'Closed';
    return (
      <AccountContextMenu account={a} onRequestClose={setClosingAccount} onRequestReopen={reopen}>
        <NavLink
          to={`/accounts/${a.id}`}
          className={({ isActive }) =>
            cn(
              'block rounded-md p-2 text-sm hover:bg-muted',
              isActive && 'bg-muted font-medium',
              isClosed && 'opacity-60',
            )
          }
        >
          <div className="flex items-baseline justify-between gap-2">
            <span>{a.name}</span>
            <span className="tabular-nums">{formatAccountBalance(a)}</span>
          </div>
          {isClosed ? (
            <div className="text-xs text-muted-foreground">Closed</div>
          ) : (
            a.subtype && (
              <div className="text-xs text-muted-foreground">{formatAccountSubtypeLabel(a)}</div>
            )
          )}
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
                  onClick={() => setEditing(true)}
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
          <ul className="space-y-1">
            {openAccounts.map((a) => (
              <li key={a.id}>{renderAccountRow(a)}</li>
            ))}
          </ul>

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
                <ul className="mt-1 space-y-1 border-t pt-2">
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
      {selectedAccount && (
        <EditAccountDialog open={editing} onOpenChange={setEditing} account={selectedAccount} />
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
