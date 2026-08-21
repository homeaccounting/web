import { useTranslation } from 'react-i18next';
import { Store } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface TxContactQuickPickerProps {
  options: DictionaryEntryResponse[];
  value: UUID | null; // currently-assigned contact id (may be archived/absent)
  onSelect: (id: UUID | null) => void;
  // Creates the dictionary entry and returns its new id (null on failure). The
  // ASSIGNMENT is owned here so it flows through this picker's own onSelect path.
  onCreate: (name: string) => Promise<UUID | null>;
  createHint?: string;
}

// Single-select (nullable) contact submenu. Picking commits via onSelect (the
// parent fires the PATCH). Mirrors TxCategoryQuickPicker, adding a "— none —"
// clear row and create-then-assign in one gesture.
export function TxContactQuickPicker({
  options,
  value,
  onSelect,
  onCreate,
  createHint,
}: TxContactQuickPickerProps) {
  const { t } = useTranslation('transactions');
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Store className="mr-2 h-4 w-4" aria-hidden />
        {t('pickers.contact')}
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. Radix SubContent already
          prevents open-auto-focus, so MenuSearchList's mount effect takes focus. */}
      <ContextMenuSubContent className="p-0">
        <div className="p-1">
          <ContextMenuItem onSelect={() => onSelect(null)}>{t('pickers.none')}</ContextMenuItem>
        </div>
        <MenuSearchList
          options={options}
          isSelected={(id) => id === value}
          onPick={onSelect}
          searchAriaLabel={t('pickers.searchContacts')}
          placeholder={t('pickers.searchContactsPlaceholder')}
          createHint={createHint}
          onCreate={async (name) => {
            const id = await onCreate(name);
            if (id) onSelect(id);
          }}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
