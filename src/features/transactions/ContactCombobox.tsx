import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

// id, aria-invalid, aria-describedby are injected by shadcn's <FormControl>
// (which wraps us with Radix Slot). They MUST land on the inner <input> so
// the FormLabel's `htmlFor` resolves and screen readers see the validation
// state on the focusable element.
export interface ContactComboboxProps {
  options: DictionaryEntryResponse[];
  value: UUID | null;
  onChange: (id: UUID | null) => void;
  // Optional: when provided, a "Create '<query>'" row is offered for a
  // non-empty query that matches no existing option. Activating it delegates to
  // the parent, which creates the entry and then selects its id — this
  // component never calls onChange for a create.
  onCreate?: (name: string) => void | Promise<unknown>;
  placeholder?: string;
  name?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

// A single-select, searchable, CREATABLE combobox for picking an optional
// contact. Typing filters options by case-insensitive substring; the user picks
// via mouse or keyboard (ArrowDown/ArrowUp/Enter/Esc). The committed value is an
// option id or null. The list carries a leading "— none —" row that clears the
// selection, and (when onCreate is set and the query matches nothing) a trailing
// "Create '<query>'" row. Both synthetic rows participate in keyboard navigation
// and the active-index highlight alongside the option rows.
export function ContactCombobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder = 'Select a contact…',
  name,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: ContactComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  // Archived contact: a committed value that no longer exists in the dictionary
  // (the entry was renamed/removed). There is no option to select, so an editable
  // combobox would render blank and silently drop the value on the next edit.
  // Render it as static, read-only text instead so the row still shows a label
  // and the value survives an unrelated save. A non-null value with no matching
  // option triggers this. (Mirrors CategoryCombobox's "Archived category".)
  const isArchived = value !== null && !selected;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const showCreate =
    !!onCreate &&
    trimmedQuery.length > 0 &&
    !options.some((o) => o.name.toLowerCase() === trimmedQuery.toLowerCase());

  // The navigable rows, in DOM order: a leading "none" row, the filtered
  // options, then an optional "create" row. The active index runs across all of
  // them so keyboard nav and the highlight stay consistent.
  const rowCount = 1 + filtered.length + (showCreate ? 1 : 0);
  const createIndex = showCreate ? rowCount - 1 : -1;

  // Reset active highlight whenever the filter or open state changes.
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

  const commit = (id: UUID | null) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  const create = () => {
    void onCreate?.(trimmedQuery);
    setQuery('');
    setOpen(false);
  };

  // Activate whichever synthetic/option row the active index points at.
  const activate = (index: number) => {
    if (index === 0) {
      commit(null);
      return;
    }
    if (showCreate && index === createIndex) {
      create();
      return;
    }
    const opt = filtered[index - 1];
    if (opt) commit(opt.id);
  };

  const inputValue = open ? query : (selected?.name ?? '');

  const activeDescendant = (() => {
    if (!open) return undefined;
    if (active === 0) return `${listId}-none`;
    if (showCreate && active === createIndex) return `${listId}-create`;
    const opt = filtered[active - 1];
    return opt ? `${listId}-opt-${opt.id}` : undefined;
  })();

  if (isArchived) {
    // aria-invalid / aria-describedby are intentionally dropped here: this branch
    // is non-interactive and has no validation state to convey to assistive tech.
    return (
      <div
        id={inputId}
        aria-label={ariaLabel}
        className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
      >
        Archived contact
      </div>
    );
  }

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
          aria-activedescendant={activeDescendant}
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
              setActive((i) => Math.min(i + 1, rowCount - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              if (open) {
                e.preventDefault();
                activate(active);
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
          <li
            id={`${listId}-none`}
            role="option"
            aria-selected={value === null}
            onMouseDown={(e) => {
              // mousedown so the input's blur (which would close the menu)
              // doesn't beat the click handler.
              e.preventDefault();
              commit(null);
            }}
            onMouseEnter={() => setActive(0)}
            className={cn(
              'cursor-pointer rounded-sm px-2 py-1.5 text-sm text-muted-foreground',
              active === 0 && 'bg-accent text-accent-foreground',
            )}
          >
            — none —
          </li>
          {filtered.map((opt, i) => {
            const rowIndex = i + 1;
            return (
              <li
                key={opt.id}
                id={`${listId}-opt-${opt.id}`}
                role="option"
                aria-selected={opt.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(opt.id);
                }}
                onMouseEnter={() => setActive(rowIndex)}
                className={cn(
                  'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                  rowIndex === active && 'bg-accent text-accent-foreground',
                  opt.id === value && 'font-medium',
                )}
              >
                {opt.name}
              </li>
            );
          })}
          {showCreate && (
            <li
              id={`${listId}-create`}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                create();
              }}
              onMouseEnter={() => setActive(createIndex)}
              className={cn(
                'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                active === createIndex && 'bg-accent text-accent-foreground',
              )}
            >
              Create ‘{trimmedQuery}’
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
