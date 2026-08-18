import { Link2, Merge, Store, Tag, Tags } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, TransactionResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';
import { BulkLabelPicker } from './BulkLabelPicker';
import { BulkContactPicker } from './BulkContactPicker';
import type { BulkCategoryEligibility, BulkContactEligibility } from './bulkLabels';

export interface BulkTransactionMenuProps {
  count: number;
  rows: TransactionResponse[];
  labelOptions: DictionaryEntryResponse[];
  incomeCategoryEntries: DictionaryEntryResponse[];
  expenseCategoryEntries: DictionaryEntryResponse[];
  categoryEligibility: BulkCategoryEligibility;
  labelsEnabled: boolean; // allCompleted(rows)
  isApplying: boolean;
  onSetCategory: (categoryId: UUID) => void; // fan-out + close menu
  onAddLabel: (labelId: UUID) => void;
  onRemoveLabel: (labelId: UUID) => void;
  onCreateLabel: (name: string) => Promise<UUID | null>;
  contactOptions: DictionaryEntryResponse[];
  contactEligibility: BulkContactEligibility;
  onSetContact: (contactId: UUID | null) => void; // fan-out + close menu
  onCreateContact: (name: string) => Promise<UUID | null>;
  canLink: boolean;
  canMerge: boolean;
  mergeDisabledReason?: string;
  onLink: () => void;
  onMerge: () => void;
}

// The bulk context-menu body shown when a 2+ selection is right-clicked. Purely
// presentational; the pane computes eligibility and supplies the fan-out
// handlers. Category is a single-select (commits + closes via onSetCategory);
// labels stay open (BulkLabelPicker).
export function BulkTransactionMenu({
  count,
  rows,
  labelOptions,
  incomeCategoryEntries,
  expenseCategoryEntries,
  categoryEligibility,
  labelsEnabled,
  isApplying,
  onSetCategory,
  onAddLabel,
  onRemoveLabel,
  onCreateLabel,
  contactOptions,
  contactEligibility,
  onSetContact,
  onCreateContact,
  canLink,
  canMerge,
  mergeDisabledReason,
  onLink,
  onMerge,
}: BulkTransactionMenuProps) {
  const categoryOptions =
    categoryEligibility.type === 'income' ? incomeCategoryEntries : expenseCategoryEntries;
  return (
    <>
      <ContextMenuLabel>{count} selected</ContextMenuLabel>

      {categoryEligibility.enabled ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={isApplying}>
            <Tag className="mr-2 h-4 w-4" aria-hidden />
            Set category
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-0">
            <MenuSearchList
              options={categoryOptions}
              isSelected={() => false}
              onPick={(id) => onSetCategory(id)}
              searchAriaLabel="Search categories"
              placeholder="Search categories…"
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : (
        <>
          <ContextMenuItem disabled>
            <Tag className="mr-2 h-4 w-4" aria-hidden />
            Set category
          </ContextMenuItem>
          {categoryEligibility.reason && (
            <div className="px-2 pb-1 text-xs text-muted-foreground">
              {categoryEligibility.reason}
            </div>
          )}
        </>
      )}

      {labelsEnabled ? (
        <BulkLabelPicker
          options={labelOptions}
          rows={rows}
          onAdd={onAddLabel}
          onRemove={onRemoveLabel}
          onCreate={onCreateLabel}
          disabled={isApplying}
        />
      ) : (
        <>
          <ContextMenuItem disabled>
            <Tags className="mr-2 h-4 w-4" aria-hidden />
            Set labels
          </ContextMenuItem>
          <div className="px-2 pb-1 text-xs text-muted-foreground">
            Only completed transactions can be edited
          </div>
        </>
      )}

      {contactEligibility.enabled ? (
        <BulkContactPicker
          options={contactOptions}
          onSelect={onSetContact}
          onCreate={onCreateContact}
          disabled={isApplying}
        />
      ) : (
        <>
          <ContextMenuItem disabled>
            <Store className="mr-2 h-4 w-4" aria-hidden />
            Set contact
          </ContextMenuItem>
          {contactEligibility.reason && (
            <div className="px-2 pb-1 text-xs text-muted-foreground">
              {contactEligibility.reason}
            </div>
          )}
        </>
      )}

      <ContextMenuSeparator />

      {canLink && (
        <ContextMenuItem onSelect={onLink}>
          <Link2 className="mr-2 h-4 w-4" aria-hidden />
          Link
        </ContextMenuItem>
      )}
      {count >= 2 && (
        <>
          <ContextMenuItem onSelect={onMerge} disabled={!canMerge}>
            <Merge className="mr-2 h-4 w-4" aria-hidden />
            Merge
          </ContextMenuItem>
          {/* Reason as a muted subtitle (matching the disabled category/labels
              items above) rather than appended inline, so a long transfer-merge
              reason wraps instead of stretching the menu. */}
          {!canMerge && mergeDisabledReason && (
            <div className="px-2 pb-1 text-xs text-muted-foreground">{mergeDisabledReason}</div>
          )}
        </>
      )}
    </>
  );
}
