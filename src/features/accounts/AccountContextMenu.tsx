import type { ReactNode } from 'react';
import { Archive, ArchiveRestore, Pencil, Users } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { AccountResponse } from '@/api/types';
import { canManage } from './roles';

export interface AccountContextMenuProps {
  account: AccountResponse;
  onRequestEdit: (account: AccountResponse) => void;
  onRequestClose: (account: AccountResponse) => void;
  onRequestReopen: (account: AccountResponse) => void;
  onRequestManageAccess: (account: AccountResponse) => void;
  children: ReactNode;
}

// Right-click menu on an account row. Presentational: emits intent so the pane
// owns the single edit/close dialogs and the single reopen mutation/error surface.
export function AccountContextMenu({
  account,
  onRequestEdit,
  onRequestClose,
  onRequestReopen,
  onRequestManageAccess,
  children,
}: AccountContextMenuProps) {
  const isClosed = account.status === 'Closed';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onRequestEdit(account)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </ContextMenuItem>
        {canManage(account.role) && (
          <ContextMenuItem onSelect={() => onRequestManageAccess(account)}>
            <Users className="mr-2 h-4 w-4" />
            Access
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {isClosed ? (
          <ContextMenuItem onSelect={() => onRequestReopen(account)}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            Reopen
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={() => onRequestClose(account)}>
            <Archive className="mr-2 h-4 w-4" />
            Close
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
