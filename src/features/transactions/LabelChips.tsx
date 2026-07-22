import { cn } from '@/lib/utils';
import { entryLeafName } from '@/api/dictionary';
import { labelChipClasses } from './labelColors';

export function LabelChips({
  labelIds,
  nameById,
  leadingGap = true,
}: {
  labelIds: string[];
  nameById: Map<string, string>;
  // Left margin separating the chips from preceding text (e.g. the description).
  // Set false when there is no preceding text so the chips hug the column edge.
  leadingGap?: boolean;
}) {
  const known = labelIds.filter((id) => nameById.has(id));
  if (known.length === 0) return null;
  const names = known.map((id) => nameById.get(id)!);
  return (
    <span
      title={names.join(', ')}
      className={cn('inline-flex flex-wrap gap-1 align-middle', leadingGap && 'ml-2')}
    >
      {known.map((id) => (
        <span
          key={id}
          className={cn('rounded px-1.5 py-0.5 text-xs font-medium', labelChipClasses(id))}
        >
          {entryLeafName(nameById.get(id)!)}
        </span>
      ))}
    </span>
  );
}
