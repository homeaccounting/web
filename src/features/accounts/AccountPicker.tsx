import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import type { AccountResponse, UUID } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AccountKindIcon } from './AccountKindIcon';
import { AccountOptionContent } from './AccountOptionContent';
import { shortAccountName } from './accountName';
import { buildPickerModel, filterPickerKinds, pickerAccountIds } from './accountPickerModel';

// id, aria-invalid and aria-describedby are injected by shadcn's <FormControl>
// via Radix Slot and must land on the trigger, the focusable element.
export interface AccountPickerProps {
  accounts: AccountResponse[];
  value: UUID | null;
  onChange: (id: UUID | null) => void;
  // Adds a leading row that selects null ("None", "Not imported").
  noneLabel?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

// Navigable rows: null is the optional "none" row.
type RowId = UUID | null;

const rowsFor = (kinds: Parameters<typeof pickerAccountIds>[0], withNone: boolean): RowId[] => [
  ...(withNone ? [null] : []),
  ...pickerAccountIds(kinds),
];

// The shared single-select account field (tracker#97): rows grouped as in the
// sidebar, a search box for longer lists, and balances on each row. The caller
// decides which accounts are offered (see transactableAccounts).
export function AccountPicker({
  accounts,
  value,
  onChange,
  noneLabel,
  placeholder,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: AccountPickerProps) {
  const { t } = useTranslation('accounts');
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const optionId = useCallback((row: RowId) => `${listId}-opt-${row ?? 'none'}`, [listId]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const model = useMemo(() => buildPickerModel(accounts), [accounts]);
  const kinds = useMemo(() => filterPickerKinds(model.kinds, query), [model.kinds, query]);
  // The none row isn't an account, so it hides while the user searches.
  const showNone = noneLabel !== undefined && query.trim() === '';
  const rows = useMemo(() => rowsFor(kinds, showNone), [showNone, kinds]);
  const rowIndex = useMemo(() => new Map(rows.map((row, i) => [row, i])), [rows]);
  const selected = accounts.find((a) => a.id === value);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setQuery('');
    setActive(Math.max(0, rowsFor(model.kinds, noneLabel !== undefined).indexOf(value)));
  };

  useEffect(() => {
    if (!open) return;
    const row = rows[active];
    if (row !== undefined)
      document.getElementById(optionId(row))?.scrollIntoView({ block: 'nearest' });
  }, [open, active, rows, optionId]);

  const pick = (row: RowId) => {
    onChange(row);
    setOpen(false);
  };

  const handleListKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.max(0, Math.min(i + 1, rows.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, rows.length - 1));
    } else if (e.key === 'Enter') {
      const row = rows[active];
      if (row === undefined) return;
      e.preventDefault();
      pick(row);
    }
  };

  const activeRow = rows[active];
  const activeId = open && activeRow !== undefined ? optionId(activeRow) : undefined;

  const renderOption = (row: RowId, label: string, content: ReactNode, indent = false) => {
    const index = rowIndex.get(row) ?? -1;
    const isSelected = row === value;
    return (
      <div
        key={row ?? 'none'}
        id={optionId(row)}
        role="option"
        tabIndex={-1}
        aria-selected={isSelected}
        aria-label={label}
        onMouseDown={(e) => {
          // Keeps focus in the search box (or listbox) through the pick.
          e.preventDefault();
        }}
        onClick={() => pick(row)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          pick(row);
        }}
        onMouseEnter={() => setActive(index)}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
          indent && 'pl-4',
          index === active && 'bg-accent text-accent-foreground',
        )}
      >
        {content}
        <Check aria-hidden className={cn('h-4 w-4 shrink-0', !isSelected && 'invisible')} />
      </div>
    );
  };

  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              handleOpenChange(true);
            }
          }}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <AccountKindIcon account={selected} />
              <span className="truncate">{shortAccountName(selected)}</span>
            </span>
          ) : value === null && noneLabel !== undefined ? (
            <span className="truncate">{noneLabel}</span>
          ) : (
            <span className="truncate text-muted-foreground">
              {placeholder ?? t('picker.placeholder')}
            </span>
          )}
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-72 p-0"
        onOpenAutoFocus={(e) => {
          // Focus is set explicitly: the search box when present, else the
          // listbox, which then takes the keyboard.
          e.preventDefault();
          (searchRef.current ?? listRef.current)?.focus();
        }}
      >
        {model.showSearch && (
          <div className="border-b p-1">
            <Input
              ref={searchRef}
              role="combobox"
              aria-label={t('picker.search')}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeId}
              autoComplete="off"
              placeholder={t('picker.search')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={handleListKeyDown}
              className="h-8"
            />
          </div>
        )}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          aria-activedescendant={model.showSearch ? undefined : activeId}
          onKeyDown={model.showSearch ? undefined : handleListKeyDown}
          className="max-h-72 overflow-auto p-1 outline-none"
        >
          {showNone &&
            noneLabel !== undefined &&
            renderOption(null, noneLabel, <span className="flex-1">{noneLabel}</span>)}
          {kinds.map((kind) => (
            <div key={kind.key}>
              {model.showHeaders && (
                <div
                  aria-hidden
                  className="sticky top-0 z-10 bg-popover px-2 py-1 text-xs font-semibold text-muted-foreground"
                >
                  {kind.label}
                </div>
              )}
              {kind.sections.map((section) => {
                const subHeader = model.showHeaders && section.subLabel !== null;
                return (
                  <div
                    key={section.key}
                    role={model.showHeaders ? 'group' : undefined}
                    aria-label={model.showHeaders ? section.ariaLabel : undefined}
                  >
                    {subHeader && (
                      <div aria-hidden className="px-4 py-1 text-xs text-muted-foreground">
                        {section.subLabel}
                      </div>
                    )}
                    {section.accounts.map((a) =>
                      renderOption(
                        a.id,
                        shortAccountName(a),
                        <AccountOptionContent account={a} showQualifier={!subHeader} />,
                        subHeader,
                      ),
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">{t('picker.noMatches')}</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
