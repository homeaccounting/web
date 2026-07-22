import { cn } from '@/lib/utils';
import { entryLeafName } from '@/api/dictionary';
import { labelChipClasses } from './labelColors';

// Renders a transaction's allocation categories as colored chips — the same
// visual treatment as LabelChips — so a split transaction shows all its
// categories instead of a "first +N" summary. Order is income slices then
// expense slices (as produced by `allocationCategoryIds`). Unknown ids
// (not in the dictionary) are dropped; an all-unknown/empty list renders
// nothing (transfers/adjustments have no categories).
export function CategoryChips({
  categoryIds,
  nameById,
  nowrap = false,
}: {
  categoryIds: string[];
  nameById: Map<string, string>;
  // In the transactions table the column is a fixed width and rows must keep a
  // constant height, so chips stay on a single line and overflow is clipped
  // (the full list is in the wrapper's title). Elsewhere they may wrap.
  nowrap?: boolean;
}) {
  const known = categoryIds.filter((id) => nameById.has(id));
  if (known.length === 0) return null;
  const names = known.map((id) => nameById.get(id)!);
  return (
    <span
      title={names.join(', ')}
      className={cn(
        'flex gap-1 align-middle',
        nowrap ? 'flex-nowrap overflow-hidden' : 'inline-flex flex-wrap',
      )}
    >
      {known.map((id, i) => (
        <span
          // A category id can repeat across slices (two rows, same category),
          // so disambiguate the key by position.
          key={`${id}-${i}`}
          className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', labelChipClasses(id))}
        >
          {entryLeafName(nameById.get(id)!)}
        </span>
      ))}
    </span>
  );
}
