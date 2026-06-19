import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

// id, aria-invalid, aria-describedby are injected by shadcn's <FormControl>
// (which wraps us with Radix Slot). They MUST land on the inner <input> so
// the FormLabel's `htmlFor` resolves and screen readers see the validation
// state on the focusable element.
export interface CategoryComboboxProps {
  options: DictionaryEntryResponse[];
  value: string;
  onChange: (id: UUID) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

// A simple searchable single-select. Typing filters the option list by
// case-insensitive substring; the user picks via mouse or keyboard
// (ArrowDown/ArrowUp/Enter/Esc). The committed value is the option id —
// free-text input is not allowed: if the typed text doesn't match an
// option, blur restores the previously-selected name.
export function CategoryCombobox({
  options,
  value,
  onChange,
  placeholder = 'Select a category…',
  name,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: CategoryComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // Reset active highlight whenever the filter changes.
  useEffect(() => {
    setActive(0);
  }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (entry: DictionaryEntryResponse) => {
    onChange(entry.id);
    setQuery('');
    setOpen(false);
  };

  const inputValue = open ? query : (selected?.name ?? '');

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Input
          id={inputId}
          name={name}
          autoComplete="off"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && filtered[active] ? `${listId}-opt-${filtered[active].id}` : undefined
          }
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              setActive((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              if (open && filtered[active]) {
                e.preventDefault();
                commit(filtered[active]);
              }
            } else if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                setOpen(false);
                setQuery('');
              }
            }
          }}
          className="pr-10"
        />
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt.id}
              id={`${listId}-opt-${opt.id}`}
              role="option"
              aria-selected={opt.id === value}
              onMouseDown={(e) => {
                // mousedown so the input's blur (which would close the menu)
                // doesn't beat the click handler.
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                i === active && 'bg-accent text-accent-foreground',
                opt.id === value && 'font-medium',
              )}
            >
              {opt.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
