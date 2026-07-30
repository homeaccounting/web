import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AccountResponse, UUID } from '@/api/types';
import { accountLabel } from '@/features/accounts/accountLabel';

export interface AccountMultiSelectProps {
  options: AccountResponse[];
  value: UUID[];
  onChange: (ids: UUID[]) => void;
  // id, aria-invalid, aria-describedby are injected by shadcn's <FormControl>
  // via Radix Slot — see CategoryCombobox for the rationale.
  id?: string;
  name?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  // Optional override for the chip container (e.g. the filter bar pins it to a
  // single h-10 line with horizontal scroll so its height doesn't grow as
  // chips are added). Forms omit it and keep the default wrapping behaviour.
  containerClassName?: string;
}

// Multi-select with type-ahead over accounts. Typing filters the option list
// by case-insensitive substring on the bank-qualified display label; clicking
// an option toggles its membership in `value` without closing the menu.
// Selected entries render as removable chips inside the input area. Mirrors
// LabelMultiSelect — see that file for the shared structure/behavior.
export function AccountMultiSelect({
  options,
  value,
  onChange,
  id,
  name,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
  containerClassName,
}: AccountMultiSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const label = useCallback((a: AccountResponse) => accountLabel(a, options), [options]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => label(o).toLowerCase().includes(q));
  }, [options, query, label]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

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

  const toggle = (entry: AccountResponse) => {
    if (value.includes(entry.id)) {
      onChange(value.filter((x) => x !== entry.id));
    } else {
      onChange([...value, entry.id]);
    }
  };

  const remove = (id: UUID) => onChange(value.filter((x) => x !== id));

  const selected = value
    .map((id) => options.find((o) => o.id === id))
    .filter((x): x is AccountResponse => !!x);

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          containerClassName,
        )}
      >
        {selected.map((entry) => (
          <span
            key={entry.id}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
          >
            {label(entry)}
            <button
              type="button"
              aria-label={`Remove ${label(entry)}`}
              onClick={() => remove(entry.id)}
              className="rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          id={inputId}
          name={name}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && filtered[active] ? `${listId}-opt-${filtered[active].id}` : undefined
          }
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          placeholder={selected.length === 0 ? 'All accounts' : ''}
          value={query}
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
                toggle(filtered[active]);
              }
            } else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
              e.preventDefault();
              remove(selected[selected.length - 1]!.id);
            } else if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                setOpen(false);
                setQuery('');
              }
            }
          }}
          className="h-7 min-w-[8ch] flex-1 border-0 px-1 py-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <ChevronDown
          aria-hidden
          className="ml-auto h-4 w-4 text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
          )}
          {filtered.map((opt, i) => {
            const checked = value.includes(opt.id);
            return (
              <li
                key={opt.id}
                id={`${listId}-opt-${opt.id}`}
                role="option"
                aria-selected={checked}
                onMouseDown={(e) => {
                  // mousedown so the input's blur (which would close the menu)
                  // doesn't beat the click handler. Clearing the query also
                  // keeps the typeahead UX predictable across consecutive picks.
                  e.preventDefault();
                  toggle(opt);
                  setQuery('');
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span className={cn(checked && 'font-medium')}>{label(opt)}</span>
                {checked && <Check aria-hidden className="h-4 w-4" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
