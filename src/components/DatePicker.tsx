import { useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FMT = 'yyyy-MM-dd';

function parseValue(v: string): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, FMT, new Date());
  return isValid(d) ? d : undefined;
}

export interface DatePickerProps {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string; // 'YYYY-MM-DD' — disable days before this
  maxDate?: string; // 'YYYY-MM-DD' — disable days after this
  // Injected by <FormControl> via Radix Slot; land on the focusable trigger.
  id?: string;
  name?: string;
  onBlur?: () => void;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  minDate,
  maxDate,
  id,
  name,
  onBlur,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseValue(value);
  const min = parseValue(minDate ?? '');
  const max = parseValue(maxDate ?? '');
  const disabledMatchers = [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          name={name}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          className={cn(
            'h-10 w-full justify-start text-left font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
          {selected ? format(selected, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabledMatchers.length ? disabledMatchers : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, FMT) : '');
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
