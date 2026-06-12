import { useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FMT = 'yyyy-MM-dd';

function parseValue(v: string): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, FMT, new Date());
  return isValid(d) ? d : undefined;
}

// Split a picker value into its day ('YYYY-MM-DD') and time ('HH:MM') parts.
// Accepts a bare date, a 'YYYY-MM-DDTHH:MM' datetime, or ''.
function splitValue(v: string): { day: string; time: string } {
  if (!v) return { day: '', time: '' };
  const [day, time = ''] = v.split('T');
  return { day: day ?? '', time: time.slice(0, 5) };
}

// Local wall-clock 'HH:MM' right now. Used as the default time when a day is
// picked in a time-enabled picker and no time has been chosen yet.
function currentTimeHHMM(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface DatePickerProps {
  value: string; // 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM' (when withTime), or ''
  onChange: (value: string) => void;
  // When true, also expose a time-of-day (HH:MM) input and emit a
  // 'YYYY-MM-DDTHH:MM' value. Defaults to false (date-only), so existing
  // date-range pickers are unaffected.
  withTime?: boolean;
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
  withTime = false,
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
  const { day, time } = splitValue(value);
  const selected = parseValue(day);
  const min = parseValue(minDate ?? '');
  const max = parseValue(maxDate ?? '');
  const disabledMatchers = [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];

  const emit = (nextDay: string, nextTime: string) => {
    if (!nextDay) {
      onChange('');
      return;
    }
    onChange(withTime ? `${nextDay}T${nextTime || currentTimeHHMM()}` : nextDay);
  };

  const label = selected
    ? `${format(selected, 'PPP')}${withTime && time ? ` ${time}` : ''}`
    : placeholder;

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
          {selected ? <span>{label}</span> : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabledMatchers.length ? disabledMatchers : undefined}
          onSelect={(d) => {
            const nextDay = d ? format(d, FMT) : '';
            emit(nextDay, time);
            // Keep the popover open when picking a time too, so the user can
            // adjust both in one interaction.
            if (!withTime) setOpen(false);
          }}
        />
        {withTime && (
          <div className="flex items-center gap-2 border-t p-3">
            <label
              htmlFor={id ? `${id}-time` : undefined}
              className="text-sm text-muted-foreground"
            >
              Time
            </label>
            <Input
              id={id ? `${id}-time` : undefined}
              type="time"
              aria-label="Time"
              className="h-9 w-32"
              value={time}
              onChange={(e) => emit(day, e.target.value)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
