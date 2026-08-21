import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

// The text shown in (and typed into) the editable field for a given picker
// value: 'YYYY-MM-DD' or, when withTime, 'YYYY-MM-DD HH:MM'. Empty for ''.
function formatText(value: string, withTime: boolean): string {
  const { day, time } = splitValue(value);
  if (!day) return '';
  return withTime && time ? `${day} ${time}` : day;
}

// Local wall-clock 'HH:MM' right now. Used as the default time when a day is
// picked (or typed without a time) in a time-enabled picker.
function currentTimeHHMM(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Normalise a typed time to 'HH:MM' (24h), or null if it isn't a valid time.
// Accepts 'H:MM' and 'HH:MM'.
function normalizeTime(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
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
  // Injected by <FormControl> via Radix Slot; land on the editable input.
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
  placeholder,
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
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  // The editable text. Decoupled from `value` while the user types; committed
  // (parsed + validated) on blur/Enter, and re-synced whenever `value` changes
  // externally (e.g. a day picked in the calendar).
  const [text, setText] = useState(() => formatText(value, withTime));
  useEffect(() => {
    setText(formatText(value, withTime));
  }, [value, withTime]);

  const { day, time } = splitValue(value);
  const selected = parseValue(day);
  const min = parseValue(minDate ?? '');
  const max = parseValue(maxDate ?? '');
  const disabledMatchers = [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];

  // Emit a value from the calendar / time-input paths (day already validated by
  // the calendar's own disabled matchers).
  const emit = (nextDay: string, nextTime: string) => {
    if (!nextDay) {
      onChange('');
      return;
    }
    onChange(withTime ? `${nextDay}T${nextTime || currentTimeHHMM()}` : nextDay);
  };

  // Parse + validate typed text and emit, or revert to the last committed value.
  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setText('');
      onChange('');
      return;
    }
    const revert = () => setText(formatText(value, withTime));
    const [dPart = '', tPart = ''] = trimmed.split(/\s+/);
    const d = parse(dPart, FMT, new Date());
    if (!isValid(d)) return revert();
    if (min && d < min) return revert();
    if (max && d > max) return revert();
    const nextDay = format(d, FMT);
    if (!withTime) {
      setText(nextDay);
      onChange(nextDay);
      return;
    }
    const nextTime = tPart ? normalizeTime(tPart) : time || currentTimeHHMM();
    if (nextTime === null) return revert();
    setText(`${nextDay} ${nextTime}`);
    onChange(`${nextDay}T${nextTime}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <Input
          id={id}
          name={name}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          placeholder={placeholder ?? t('datePicker.placeholder')}
          value={text}
          className="pr-10"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            commitText(text);
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText(text);
            }
          }}
        />
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              ariaLabel
                ? t('datePicker.calendarFor', { label: ariaLabel })
                : t('datePicker.openCalendar')
            }
            className="absolute right-0 top-0 h-full w-10 text-muted-foreground"
          >
            <CalendarIcon className="h-4 w-4" aria-hidden />
          </Button>
        </PopoverTrigger>
      </div>
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
              {t('datePicker.time')}
            </label>
            <Input
              id={id ? `${id}-time` : undefined}
              type="time"
              aria-label={t('datePicker.time')}
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
