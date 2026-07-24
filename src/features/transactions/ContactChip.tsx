import { Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { entryLeafName } from '@/api/dictionary';

// A transaction's counterparty rendered as a single chip beside the label chips.
// Uses the same Store icon as TxContactQuickPicker for a consistent visual, and a
// neutral `bg-muted` style that reads as distinct from the colored label chips.
export function ContactChip({
  contactId,
  nameById,
  leadingGap = true,
}: {
  contactId: string | null;
  nameById: Map<string, string>;
  // Left margin separating the chip from preceding content (description/label
  // chips). Set false when there is nothing before it so it hugs the edge.
  leadingGap?: boolean;
}) {
  if (contactId === null || !nameById.has(contactId)) return null;
  const full = nameById.get(contactId)!;
  return (
    <span
      title={full}
      className={cn(
        'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-medium',
        leadingGap && 'ml-2',
      )}
    >
      <Store aria-hidden className="h-3 w-3" />
      {entryLeafName(full)}
    </span>
  );
}
