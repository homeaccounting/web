import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

export interface MenuSearchListProps {
  options: DictionaryEntryResponse[];
  isSelected: (id: UUID) => boolean;
  onPick: (id: UUID) => void;
  searchAriaLabel: string;
  placeholder: string;
}

// A search box + option list built to live *inside* a Radix menu popup
// (e.g. ContextMenuSubContent, which is itself the popup). It manages its own
// query/active state and isolates keyboard + focus from the surrounding Radix
// menu so the menu's built-in typeahead and roving-focus don't hijack typing.
// Unlike CategoryCombobox/LabelMultiSelect it does NOT render its own popup
// wrapper or an outside-click listener — the menu owns those.
export function MenuSearchList({
  options,
  isSelected,
  onPick,
  searchAriaLabel,
  placeholder,
}: MenuSearchListProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The submenu's onOpenAutoFocus is prevented by the picker, so take focus here.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  return (
    <div className="w-56">
      <div className="p-1">
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded
          aria-label={searchAriaLabel}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Let Escape bubble so Radix can close the submenu.
            if (e.key === 'Escape') return;
            // Everything else stays here: without this, Radix Menu's typeahead
            // eats typed letters and its roving focus steals Arrow keys.
            e.stopPropagation();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              const opt = filtered[active];
              if (opt) {
                e.preventDefault();
                onPick(opt.id);
              }
            }
          }}
          className="h-8"
        />
      </div>
      <ul role="listbox" aria-label={searchAriaLabel} className="max-h-60 overflow-auto p-1">
        {filtered.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
        )}
        {filtered.map((opt, i) => {
          const checked = isSelected(opt.id);
          return (
            <li
              key={opt.id}
              role="option"
              aria-selected={checked}
              onMouseDown={(e) => {
                // mousedown (not click) so the input's blur doesn't beat the pick.
                e.preventDefault();
                onPick(opt.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                i === active && 'bg-accent text-accent-foreground',
              )}
            >
              <span className={cn(checked && 'font-medium')}>{opt.name}</span>
              {checked && <Check aria-hidden className="h-4 w-4" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
