import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface MoneyInputProps {
  // The numeric amount. A transient '' or '-' string is allowed while typing
  // (mirrors react-hook-form fields that hold the raw input during entry).
  value: number | string | null | undefined;
  onChange: (value: number | string) => void;
  // Read-only currency shown in the trailing badge (derived from the account).
  currency: string;
  placeholder?: string;
  // Injected by <FormControl> via Radix Slot; land on the editable input.
  id?: string;
  name?: string;
  onBlur?: () => void;
  // react-hook-form's field.ref, forwarded to the underlying <input>.
  inputRef?: Ref<HTMLInputElement>;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  className?: string; // applied to the wrapper (width lives here)
  inputClassName?: string; // applied to the <input> itself
}

// Amount field + trailing currency badge — the single money-entry control used
// across the transaction dialogs (transfer amount, adjust-balance target, each
// allocation row). Encapsulates the shared number-parsing rules so a transient
// '' / '-' survives while typing and a completed entry emits a real number.
export function MoneyInput({
  value,
  onChange,
  currency,
  placeholder,
  id,
  name,
  onBlur,
  inputRef,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
  className,
  inputClassName,
}: MoneyInputProps) {
  const { t } = useTranslation('common');
  const display =
    value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value))
      ? ''
      : value;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        type="number"
        step="any"
        id={id}
        name={name}
        ref={inputRef}
        onBlur={onBlur}
        aria-label={ariaLabel ?? t('moneyInput.amount')}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        placeholder={placeholder}
        className={inputClassName}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '' || raw === '-') {
            onChange(raw);
            return;
          }
          const n = e.target.valueAsNumber;
          onChange(Number.isNaN(n) ? raw : n);
        }}
      />
      <div
        data-testid="currency-badge"
        aria-label={t('moneyInput.currency')}
        className="inline-flex h-10 shrink-0 items-center rounded-md border bg-muted px-3 text-sm tabular-nums text-muted-foreground"
      >
        {currency || '—'}
      </div>
    </div>
  );
}
