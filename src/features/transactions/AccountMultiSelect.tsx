import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Minus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AccountResponse, UUID } from '@/api/types';
import { AccountOptionContent } from '@/features/accounts/AccountOptionContent';
import { shortAccountName } from '@/features/accounts/accountName';
import {
  buildPickerModel,
  filterPickerKinds,
  type PickerKind,
} from '@/features/accounts/accountPickerModel';

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

// A navigable row: a group header toggles every account under it.
type Row =
  | { type: 'group'; key: string; label: string; ids: UUID[] }
  | { type: 'account'; account: AccountResponse };

const rowKey = (row: Row) => (row.type === 'group' ? `group:${row.key}` : row.account.id);

const idsOf = (accounts: AccountResponse[]) => accounts.map((a) => a.id);

function rowsFor(kinds: PickerKind[], showHeaders: boolean): Row[] {
  return kinds.flatMap((k): Row[] => [
    ...(showHeaders
      ? [
          {
            type: 'group' as const,
            key: k.key,
            label: k.label,
            ids: k.sections.flatMap((s) => idsOf(s.accounts)),
          },
        ]
      : []),
    ...k.sections.flatMap((s): Row[] => [
      ...(showHeaders && s.subLabel !== null
        ? [{ type: 'group' as const, key: s.key, label: s.ariaLabel, ids: idsOf(s.accounts) }]
        : []),
      ...s.accounts.map((account) => ({ type: 'account' as const, account })),
    ]),
  ]);
}

// Multi-select with type-ahead over accounts, grouped like AccountPicker and
// the sidebar (tracker#97). Typing filters with the picker's token search over
// full names (see accountName.ts); clicking a row toggles it without closing
// the menu, and a header toggles the visible accounts under it. Selected
// entries render as removable chips inside the input area. Mirrors
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
  const { t } = useTranslation(['transactions', 'accounts']);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const label = useCallback((a: AccountResponse) => shortAccountName(a), []);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const model = useMemo(() => buildPickerModel(options), [options]);
  const filtered = useMemo(() => filterPickerKinds(model.kinds, query), [model.kinds, query]);
  const rows = useMemo(() => rowsFor(filtered, model.showHeaders), [filtered, model.showHeaders]);
  const rowIndex = useMemo(() => new Map(rows.map((row, i) => [rowKey(row), i])), [rows]);
  const optionId = useCallback((i: number) => `${listId}-opt-${i}`, [listId]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active, optionId]);

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

  const toggleGroup = (ids: UUID[]) => {
    if (ids.every((id) => value.includes(id))) {
      onChange(value.filter((x) => !ids.includes(x)));
    } else {
      onChange([...value, ...ids.filter((id) => !value.includes(id))]);
    }
  };

  const toggleRow = (row: Row) => {
    if (row.type === 'group') toggleGroup(row.ids);
    else toggle(row.account);
  };

  const remove = (id: UUID) => onChange(value.filter((x) => x !== id));

  const selected = value
    .map((id) => options.find((o) => o.id === id))
    .filter((x): x is AccountResponse => !!x);

  const renderOption = (
    key: string,
    label: string,
    state: 'all' | 'some' | 'none',
    onPick: () => void,
    content: ReactNode,
    className?: string,
  ) => {
    const index = rowIndex.get(key) ?? -1;
    const Mark = state === 'some' ? Minus : Check;
    return (
      <div
        key={key}
        id={optionId(index)}
        role="option"
        tabIndex={-1}
        aria-selected={state === 'all'}
        aria-label={label}
        onMouseDown={(e) => {
          // mousedown so the input's blur (which would close the menu)
          // doesn't beat the click handler. Clearing the query also
          // keeps the typeahead UX predictable across consecutive picks.
          e.preventDefault();
          onPick();
          setQuery('');
        }}
        onMouseEnter={() => setActive(index)}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
          className,
          index === active && 'bg-accent text-accent-foreground',
        )}
      >
        {content}
        <Mark aria-hidden className={cn('h-4 w-4 shrink-0', state === 'none' && 'invisible')} />
      </div>
    );
  };

  // Toggles the accounts the search leaves visible under this header.
  const renderGroup = (
    key: string,
    label: string,
    ids: UUID[],
    content: ReactNode,
    className: string,
  ) => {
    const count = ids.filter((id) => value.includes(id)).length;
    const state = count === 0 ? 'none' : count === ids.length ? 'all' : 'some';
    return renderOption(
      `group:${key}`,
      t('accounts:picker.selectGroup', { group: label }),
      state,
      () => toggleGroup(ids),
      content,
      className,
    );
  };

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
              aria-label={t('pickers.remove', { name: label(entry) })}
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
          aria-activedescendant={open && rows[active] ? optionId(active) : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          placeholder={selected.length === 0 ? t('pickers.allAccounts') : ''}
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
              setActive((i) => Math.max(0, Math.min(i + 1, rows.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              const row = rows[active];
              if (open && row) {
                e.preventDefault();
                toggleRow(row);
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
        <div className="absolute z-50 mt-1 w-full min-w-80 rounded-md border bg-popover text-popover-foreground shadow-md">
          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            className="max-h-72 overflow-auto p-1"
          >
            {filtered.map((kind) => (
              <div key={kind.key}>
                {model.showHeaders &&
                  renderGroup(
                    kind.key,
                    kind.label,
                    kind.sections.flatMap((s) => idsOf(s.accounts)),
                    <span className="flex-1 font-semibold">{kind.label}</span>,
                    'sticky top-0 z-10 bg-popover text-xs text-muted-foreground',
                  )}
                {kind.sections.map((section) => {
                  const subHeader = model.showHeaders && section.subLabel !== null;
                  return (
                    <div
                      key={section.key}
                      role={model.showHeaders ? 'group' : undefined}
                      aria-label={model.showHeaders ? section.ariaLabel : undefined}
                    >
                      {subHeader &&
                        renderGroup(
                          section.key,
                          section.ariaLabel,
                          idsOf(section.accounts),
                          <span className="flex-1">{section.subLabel}</span>,
                          'pl-4 text-xs text-muted-foreground',
                        )}
                      {section.accounts.map((a) =>
                        renderOption(
                          a.id,
                          shortAccountName(a),
                          value.includes(a.id) ? 'all' : 'none',
                          () => toggle(a),
                          <AccountOptionContent account={a} showQualifier={!subHeader} />,
                          subHeader ? 'pl-4' : undefined,
                        ),
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {rows.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t('pickers.noMatches')}</div>
          )}
        </div>
      )}
    </div>
  );
}
