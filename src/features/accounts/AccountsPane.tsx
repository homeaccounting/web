import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAccounts } from './useAccounts';
import { useAccountById } from './useAccountById';
import { CreateAccountDialog } from './CreateAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import { SyncNowButton } from './SyncNowButton';
import { formatAccountBalance, formatAccountSubtypeLabel } from './format';

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const { id } = useParams<{ id?: string }>();
  const { data: selectedAccount } = useAccountById(id);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const accountActionsDisabled = !selectedAccount;

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
        <ul className="space-y-1 p-2">
          {data.map((a) => (
            <li key={a.id}>
              <NavLink
                to={`/accounts/${a.id}`}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md p-2 text-sm hover:bg-muted',
                    isActive && 'bg-muted font-medium',
                  )
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span>{a.name}</span>
                  <span className="tabular-nums">{formatAccountBalance(a)}</span>
                </div>
                {a.subtype && (
                  <div className="text-xs text-muted-foreground">
                    {formatAccountSubtypeLabel(a)}
                  </div>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      )}

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
      {selectedAccount && (
        <EditAccountDialog open={editing} onOpenChange={setEditing} account={selectedAccount} />
      )}
    </>
  );
}
