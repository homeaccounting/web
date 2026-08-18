import { Store } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface BulkContactPickerProps {
  options: DictionaryEntryResponse[];
  onSelect: (id: UUID | null) => void; // apply to every selected row (null = clear)
  onCreate: (name: string) => Promise<UUID | null>;
  createHint?: string;
  disabled?: boolean; // true while a batch is applying
}

// Single-select nullable bulk contact submenu — the fan-out twin of
// TxContactQuickPicker. Picking commits via onSelect (the parent fans the PUT out
// over the selection and closes the menu). A "— none —" row clears the contact on
// all rows; typing a new name creates then assigns it. No per-contact checkmarks
// (isSelected={() => false}), matching bulk Set category.
export function BulkContactPicker({
  options,
  onSelect,
  onCreate,
  createHint,
  disabled,
}: BulkContactPickerProps) {
  const handleCreate = async (name: string) => {
    if (disabled) return;
    const id = await onCreate(name);
    if (id) onSelect(id);
  };
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        <Store className="mr-2 h-4 w-4" aria-hidden />
        Set contact
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. */}
      <ContextMenuSubContent className="p-0">
        <div className="p-1">
          <ContextMenuItem onSelect={() => !disabled && onSelect(null)}>— none —</ContextMenuItem>
        </div>
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={(id) => !disabled && onSelect(id)}
          searchAriaLabel="Search contacts"
          placeholder="Search contacts…"
          createHint={createHint}
          onCreate={handleCreate}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
