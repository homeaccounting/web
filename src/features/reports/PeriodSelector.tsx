import { DatePicker } from '@/components/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PERIOD_PRESETS, PERIOD_PRESET_LABELS, type DayRange, type PeriodPreset } from './period';

export type PeriodValue = PeriodPreset | 'custom';

export interface PeriodSelectorProps {
  value: PeriodValue;
  range: DayRange;
  onPresetChange: (preset: PeriodValue) => void;
  onRangeChange: (range: DayRange) => void;
}

export function PeriodSelector({
  value,
  range,
  onPresetChange,
  onRangeChange,
}: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Select value={value} onValueChange={(v) => onPresetChange(v as PeriodValue)}>
        <SelectTrigger aria-label="Period" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {PERIOD_PRESET_LABELS[p]}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {value === 'custom' && (
        <>
          <label htmlFor="report-from" className="flex items-center gap-1">
            From
            <DatePicker
              id="report-from"
              value={range.from}
              onChange={(from) => onRangeChange({ ...range, from })}
              aria-label="From"
              maxDate={range.to}
              placeholder="From"
              className="w-auto"
            />
          </label>
          <label htmlFor="report-to" className="flex items-center gap-1">
            To
            <DatePicker
              id="report-to"
              value={range.to}
              onChange={(to) => onRangeChange({ ...range, to })}
              aria-label="To"
              minDate={range.from}
              placeholder="To"
              className="w-auto"
            />
          </label>
        </>
      )}
    </div>
  );
}
