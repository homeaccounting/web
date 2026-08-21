import { useTranslation } from 'react-i18next';
import { DatePicker } from '@/components/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type DayRange, type PeriodPreset, type PeriodValue } from '@/lib/period';

export interface PeriodSelectorProps {
  value: PeriodValue;
  range: DayRange;
  presets: readonly PeriodPreset[];
  onPresetChange: (preset: PeriodValue) => void;
  onRangeChange: (range: DayRange) => void;
}

export function PeriodSelector({
  value,
  range,
  presets,
  onPresetChange,
  onRangeChange,
}: PeriodSelectorProps) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Select value={value} onValueChange={(v) => onPresetChange(v as PeriodValue)}>
        <SelectTrigger aria-label={t('period.label')} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`period.presets.${p}`)}
            </SelectItem>
          ))}
          <SelectItem value="custom">{t('period.custom')}</SelectItem>
        </SelectContent>
      </Select>
      {value === 'custom' && (
        <>
          {/* Label points at the input via htmlFor rather than wrapping the
              DatePicker: the picker renders two labelable controls (the typable
              input + the calendar button), so a wrapping <label> would
              ambiguously name both. */}
          <div className="flex items-center gap-1">
            <label htmlFor="period-from">{t('period.from')}</label>
            <DatePicker
              id="period-from"
              value={range.from}
              onChange={(from) => onRangeChange({ ...range, from })}
              aria-label={t('period.from')}
              maxDate={range.to}
              placeholder={t('period.from')}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-1">
            <label htmlFor="period-to">{t('period.to')}</label>
            <DatePicker
              id="period-to"
              value={range.to}
              onChange={(to) => onRangeChange({ ...range, to })}
              aria-label={t('period.to')}
              minDate={range.from}
              placeholder={t('period.to')}
              className="w-auto"
            />
          </div>
        </>
      )}
    </div>
  );
}
