import { useTranslation } from 'react-i18next';
import { Tag } from 'lucide-react';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface TxCategoryQuickPickerProps {
  options: DictionaryEntryResponse[];
  value: UUID | undefined; // currently-assigned category id (may be archived/absent)
  onSelect: (categoryId: UUID) => void;
}

// Single-select category submenu. Picking commits via onSelect (the parent
// rebuilds allocations and fires the PATCH). The menu closes on
// Escape/outside-click — Radix ContextMenu's root open state is uncontrolled.
export function TxCategoryQuickPicker({ options, value, onSelect }: TxCategoryQuickPickerProps) {
  const { t } = useTranslation('transactions');
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Tag className="mr-2 h-4 w-4" aria-hidden />
        {t('pickers.category')}
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. Radix SubContent already
          prevents open-auto-focus, so MenuSearchList's mount effect takes focus. */}
      <ContextMenuSubContent className="p-0">
        <MenuSearchList
          options={options}
          isSelected={(id) => id === value}
          onPick={onSelect}
          searchAriaLabel={t('pickers.searchCategories')}
          placeholder={t('pickers.searchCategoriesPlaceholder')}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
