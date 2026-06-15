import type { ReactNode } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { AccountResponse } from '@/api/types';

export interface AccountContextMenuProps {
  account: AccountResponse;
  onRequestClose: (account: AccountResponse) => void;
  onRequestReopen: (account: AccountResponse) => void;
  children: ReactNode;
}

// Right-click menu on an account row. Presentational: emits intent so the pane
// owns the single close-dialog and the single reopen mutation/error surface.
export function AccountContextMenu({
  account,
  onRequestClose,
  onRequestReopen,
  children,
}: AccountContextMenuProps) {
  const isClosed = account.status === 'Closed';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
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
