import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

export interface MenuSearchListProps {
  options: DictionaryEntryResponse[];
  isSelected: (id: UUID) => boolean;
  // Optional third state for multi-target callers: an option that is on SOME
  // but not all targets renders a dash instead of a check. Never both — check
  // (on all) wins. Absent → no option is ever indeterminate.
  indeterminate?: (id: UUID) => boolean;
  onPick: (id: UUID) => void;
  searchAriaLabel: string;
  placeholder: string;
  // When set, a "Create '<query>'" row is shown for a non-empty query that
  // matches no option name (case-insensitive); activating it creates the entry.
  onCreate?: (name: string) => void | Promise<unknown>;
  // An opaque suggested name for a new item. When non-blank, a "Use: <hint>"
  // affordance fills the search box with the normalized hint.
  createHint?: string;
}

// Normalize a name/hint: trim ends and collapse internal whitespace runs.
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

// A search box + option list built to live *inside* a Radix menu popup
// (e.g. ContextMenuSubContent, which is itself the popup). It manages its own
// query/active state and isolates keyboard + focus from the surrounding Radix
// menu so the menu's built-in typeahead and roving-focus don't hijack typing.
// Unlike CategoryCombobox/LabelMultiSelect it does NOT render its own popup
// wrapper or an outside-click listener — the menu owns those.
export function MenuSearchList({
  options,
  isSelected,
  indeterminate,
  onPick,
  searchAriaLabel,
  placeholder,
  onCreate,
  createHint,
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

  // The normalized name to create, or null when a create row shouldn't show:
  // no onCreate, blank query, or an existing option already matches it.
  const createName = useMemo(() => {
    if (!onCreate) return null;
    const name = norm(query);
    if (!name) return null;
    const lower = name.toLowerCase();
    if (options.some((o) => o.name.toLowerCase() === lower)) return null;
    return name;
  }, [onCreate, query, options]);

  const hint = createHint ? norm(createHint) : '';

  // The create row (when present) is the last navigable item, at index === filtered.length.
  const createIndex = createName ? filtered.length : -1;
  const maxIndex = createName ? filtered.length : filtered.length - 1;

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
              setActive((i) => Math.min(i + 1, maxIndex));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              if (createName && active === createIndex) {
                e.preventDefault();
                void onCreate?.(createName);
              } else {
                const opt = filtered[active];
                if (opt) {
                  e.preventDefault();
                  onPick(opt.id);
                }
              }
            }
          }}
          className="h-8"
        />
      </div>
      {hint && (
        <div className="px-1 pb-1">
          <button
            type="button"
            onMouseDown={(e) => {
              // mousedown (not click) so the input's blur doesn't beat it.
              e.preventDefault();
              setQuery(hint);
              inputRef.current?.focus();
            }}
            className="w-full truncate rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Use: {hint}
          </button>
        </div>
      )}
      <ul role="listbox" aria-label={searchAriaLabel} className="max-h-60 overflow-auto p-1">
        {filtered.length === 0 && !createName && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
        )}
        {filtered.map((opt, i) => {
          const checked = isSelected(opt.id);
          const isIndeterminate = !checked && (indeterminate?.(opt.id) ?? false);
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
              {checked && <Check data-testid="check-icon" aria-hidden className="h-4 w-4" />}
              {isIndeterminate && (
                <Minus data-testid="indeterminate-icon" aria-hidden className="h-4 w-4" />
              )}
            </li>
          );
        })}
        {createName && (
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              // mousedown (not click) so the input's blur doesn't beat the create.
              e.preventDefault();
              void onCreate?.(createName);
            }}
            onMouseEnter={() => setActive(createIndex)}
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1.5 text-sm',
              active === createIndex && 'bg-accent text-accent-foreground',
            )}
          >
            <Plus aria-hidden className="h-4 w-4 shrink-0" />
            <span className="truncate">Create ‘{createName}’</span>
          </li>
        )}
      </ul>
    </div>
  );
}
