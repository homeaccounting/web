import { cn } from '@/lib/utils';
import { labelChipClasses } from './labelColors';

export function LabelChips({
  labelIds,
  nameById,
}: {
  labelIds: string[];
  nameById: Map<string, string>;
}) {
  const known = labelIds.filter((id) => nameById.has(id));
  if (known.length === 0) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {known.map((id) => (
        <span
          key={id}
          className={cn('rounded px-1.5 py-0.5 text-xs font-medium', labelChipClasses(id))}
        >
          {nameById.get(id)}
        </span>
      ))}
    </span>
  );
}
