import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import type { AccountResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import { buildAccountGroups } from './accountGroups';
import { accountLabelParts } from './accountLabel';
import { useAccounts } from './useAccounts';
import { useAccountById } from './useAccountById';
import {
  parseAccountScope,
  withAccountScope,
  isSingleAccount,
  type AccountScope,
} from '@/features/transactions/accountScope';
import { CreateAccountDialog } from './CreateAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import { CloseAccountDialog } from './CloseAccountDialog';
import { ManageAccessDialog } from './ManageAccessDialog';
import { AccountContextMenu } from './AccountContextMenu';
import { useReopenAccount } from './useAccountStatus';
import { SyncNowButton } from './SyncNowButton';
import { ImportStatementButton } from './ImportStatementButton';
import { formatAccountBalance } from './format';
import type { AccountRole } from '@/api/types';
import { canManage, canModify, ROLE_LABELS } from './roles';

// Small inline badge for shared (non-owner) rows; mirrors the RoleBadge in
// ManageAccessDialog.tsx but is scoped locally since the two components
// don't share a role-label source of truth worth extracting yet. Typed as
// AccountRole (not GrantableRole) because canManage() doesn't narrow at the
// call site below — the runtime guard still ensures 'owner' never reaches it.
function SharedRoleBadge({ role }: { role: AccountRole }) {
  return <Badge variant="status">{ROLE_LABELS[role]}</Badge>;
}

// Collapse toggle for a (sub)group header. Shared by the top-level subtype
// groups and the nested per-bank sub-groups so both read/behave identically;
// the pane indents sub-groups via a wrapper rather than styling here.
function GroupHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-1 rounded-md px-2 pb-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {label}
    </button>
  );
}

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const [searchParams] = useSearchParams();
  const scope = parseAccountScope(searchParams, data);
  const single = isSingleAccount(scope);
  const { data: selectedAccount } = useAccountById(single ?? undefined);
  const [creating, setCreating] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountResponse | null>(null);
  const [closingAccount, setClosingAccount] = useState<AccountResponse | null>(null);
  const [managingAccount, setManagingAccount] = useState<AccountResponse | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const reopenMutation = useReopenAccount();
  const accountActionsDisabled = !selectedAccount;

  const reopen = (account: AccountResponse) => {
    reopenMutation.mutate(
      { id: account.id },
      {
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Couldn’t reopen this account. Try again.',
          ),
      },
    );
  };

  const openAccounts = data?.filter((a) => a.status !== 'Closed') ?? [];
  const closedAccounts = data?.filter((a) => a.status === 'Closed') ?? [];
  const selectedIsClosed = selectedAccount?.status === 'Closed';
  const canManageSelected = !!selectedAccount && canManage(selectedAccount.role);
  const canModifySelected = !!selectedAccount && canModify(selectedAccount.role);

  // Owned accounts (grouped by subtype) followed by a synthetic "Shared with
  // me" group; see buildAccountGroups. Closed accounts are handled separately
  // below and stay independent of role.
  const openGroups = buildAccountGroups(openAccounts);

  // Target for a sidebar link: preserves period/from/to and sets (or clears,
  // for all) the `accounts` param. Returns '' when there is no query string.
  const scopeSearch = (next: AccountScope) => {
    const qs = withAccountScope(searchParams, next).toString();
    return qs ? `?${qs}` : '';
  };

  // `qualify` turns on flat-context disambiguation: each row shows its bank
  // name (currency on residual collision) so a user can identify the right
  // account without a grouping header. Off inside a bank sub-group, where the
  // sub-header already carries the bank name.
  const renderAccountList = (accounts: AccountResponse[], qualify = false) => (
    <ul className="space-y-0.5">
      {accounts.map((a) => (
        <li key={a.id}>{renderAccountRow(a, qualify ? accounts : undefined)}</li>
      ))}
    </ul>
  );

  const renderAccountRow = (a: AccountResponse, siblings?: readonly AccountResponse[]) => {
    const isClosed = a.status === 'Closed';
    const active = single === a.id;
    const { qualifier } = siblings
      ? accountLabelParts(a, siblings)
      : { qualifier: null as string | null };
    return (
      <AccountContextMenu
        account={a}
        onRequestEdit={setEditingAccount}
        onRequestClose={setClosingAccount}
        onRequestReopen={reopen}
        onRequestManageAccess={setManagingAccount}
      >
        <Link
          to={{
            pathname: '/transactions',
            search: scopeSearch({ kind: 'accounts', ids: [a.id] }),
          }}
          aria-current={active ? 'page' : undefined}
          onDoubleClick={() => setEditingAccount(a)}
          className={cn(
            // Static (non-function) className: this Link is cloned by Radix's
            // ContextMenuTrigger `asChild` Slot, which does not resolve a
            // function-form className — so `active` is computed above and the
            // `aria-current` attribute is set manually rather than relying on
            // NavLink's automatic (pathname-only) active detection.
            'flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted',
            active && 'bg-muted font-medium',
            isClosed && 'opacity-60',
          )}
        >
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate">{a.name}</span>
            {qualifier && (
              <span className="shrink-0 text-xs text-muted-foreground">{qualifier}</span>
            )}
            {!canManage(a.role) && <SharedRoleBadge role={a.role} />}
          </span>
          <span className="tabular-nums">{formatAccountBalance(a)}</span>
        </Link>
      </AccountContextMenu>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-medium">Accounts</span>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit account"
                  disabled={accountActionsDisabled || !canManageSelected}
                  onClick={() => selectedAccount && setEditingAccount(selectedAccount)}
                  className="h-9 w-9"
                >
                  <Pencil />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedAccount && !canManageSelected ? 'Owner only' : 'Edit account'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={selectedIsClosed ? 'Reopen account' : 'Close account'}
                  disabled={
                    accountActionsDisabled || !canManageSelected || reopenMutation.isPending
                  }
                  onClick={() =>
                    selectedAccount &&
                    (selectedIsClosed
                      ? reopen(selectedAccount)
                      : setClosingAccount(selectedAccount))
                  }
                  className="h-9 w-9"
                >
                  {selectedIsClosed ? <ArchiveRestore /> : <Archive />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedAccount && !canManageSelected
                  ? 'Owner only'
                  : selectedIsClosed
                    ? 'Reopen account'
                    : 'Close account'}
              </TooltipContent>
            </Tooltip>
            {/* Sync/import both write transactions, so they're Editor+ only;
                the backend enforces this regardless of the UI. */}
            {canModifySelected && <SyncNowButton selectedAccount={selectedAccount} />}
            {canModifySelected && <ImportStatementButton selectedAccount={selectedAccount} />}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Manage access"
                  disabled={!canManageSelected}
                  onClick={() => selectedAccount && setManagingAccount(selectedAccount)}
                  className="h-9 w-9"
                >
                  <Users />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Manage access</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Add account"
                  onClick={() => setCreating(true)}
                  className="h-9 w-9"
                >
                  <Plus />
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
          <Alert variant="destructive" role="alert">
            <AlertDescription>Couldn&rsquo;t load accounts.</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <EmptyState message="No accounts yet." className="p-3" />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="p-2">
          {/* All-accounts scope shortcut. A leading icon + the divider below
              set it apart from the account rows so it reads as a view-mode,
              not another account. */}
          <Link
            to={{ pathname: '/transactions', search: scopeSearch({ kind: 'all' }) }}
            aria-current={scope.kind === 'all' ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted',
              scope.kind === 'all' && 'bg-muted font-medium',
            )}
          >
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
            All accounts
          </Link>
          <div className="my-2 border-t" />
          {openGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="mb-2 last:mb-0">
                <GroupHeader
                  label={group.label}
                  collapsed={collapsed}
                  onToggle={() => toggleGroup(group.key)}
                />
                {!collapsed &&
                  (group.subgroups ? (
                    // Nested per-key sub-groups (e.g. bank accounts by bank name).
                    // Each toggles independently via its own composite key.
                    <div className="space-y-1 pl-3">
                      {group.subgroups.map((sub) => {
                        const subCollapsed = collapsedGroups.has(sub.key);
                        return (
                          <div key={sub.key}>
                            <GroupHeader
                              label={sub.label}
                              collapsed={subCollapsed}
                              onToggle={() => toggleGroup(sub.key)}
                            />
                            {!subCollapsed && renderAccountList(sub.accounts)}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    renderAccountList(group.accounts, true)
                  ))}
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
                    <li key={a.id}>{renderAccountRow(a, closedAccounts)}</li>
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
          key={editingAccount.id}
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
      {managingAccount && (
        <ManageAccessDialog
          open
          onOpenChange={(next) => {
            if (!next) setManagingAccount(null);
          }}
          account={managingAccount}
        />
      )}
    </>
  );
}
