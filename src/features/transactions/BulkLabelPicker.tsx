import { Tags } from 'lucide-react';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, TransactionResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';
import { labelState } from './bulkLabels';

export interface BulkLabelPickerProps {
  options: DictionaryEntryResponse[];
  rows: TransactionResponse[]; // the selected rows
  onAdd: (labelId: UUID) => void; // add to every selected row
  onRemove: (labelId: UUID) => void; // remove from every selected row
  onCreate: (name: string) => Promise<UUID | null>;
  createHint?: string;
  disabled?: boolean; // true while a batch is applying
}

// Tri-state bulk labels submenu. A label on ALL rows renders checked and toggles
// off (remove-from-all); anything else (some/none) toggles on (add-to-all). The
// submenu stays open across edits; state re-derives from `rows` as the parent
// refetches after each commit.
export function BulkLabelPicker({
  options,
  rows,
  onAdd,
  onRemove,
  onCreate,
  createHint,
  disabled,
}: BulkLabelPickerProps) {
  const pick = (labelId: UUID) => {
    if (disabled) return;
    if (labelState(rows, labelId) === 'all') onRemove(labelId);
    else onAdd(labelId);
  };
  const handleCreate = async (name: string) => {
    if (disabled) return;
    const id = await onCreate(name);
    if (id) onAdd(id);
  };
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        <Tags className="mr-2 h-4 w-4" aria-hidden />
        Set labels
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. */}
      <ContextMenuSubContent className="p-0">
        <MenuSearchList
          options={options}
          isSelected={(id) => labelState(rows, id) === 'all'}
          indeterminate={(id) => labelState(rows, id) === 'some'}
          onPick={pick}
          searchAriaLabel="Search labels"
          placeholder="Search labels…"
          createHint={createHint}
          onCreate={handleCreate}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
