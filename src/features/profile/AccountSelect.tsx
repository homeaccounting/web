import type { AccountResponse } from '@/api/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const NONE_VALUE = '__none__';

interface AccountSelectProps {
  id?: string;
  label: string;
  value: string; // account id or NONE_VALUE
  accounts: AccountResponse[];
  includeNone: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function AccountSelect({
  id,
  label,
  value,
  accounts,
  includeNone,
  placeholder = 'Select…',
  onChange,
}: AccountSelectProps) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-56" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && <SelectItem value={NONE_VALUE}>— none —</SelectItem>}
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
