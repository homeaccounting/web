import { useEffect, useState } from 'react';
import { useFormContext, useWatch, type Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { DatePicker } from '@/components/DatePicker';
import { ASSET_TYPES, CARD_NETWORKS } from '@/api/types';
import { useProviders } from '@/features/banking/useProviders';
import type { CreateAccountFormValues } from './schema';
import { ASSET_TYPE_LABELS, CARD_NETWORK_LABELS } from './labels';

// Radix `SelectItem` cannot use an empty-string value, so "Other…" (custom
// bank name entry) gets its own sentinel — same idiom as AccountSelect's
// NONE_VALUE / LinkAccountsDialog's NOT_IMPORTED.
const CUSTOM_BANK_VALUE = '__custom__';

// Provider Select + custom-entry fallback for `subtype.bankName`. Fails soft
// to a plain text Input when the provider list is empty/unavailable (loading,
// errored, or genuinely empty) — see useProviders().
function BankNameField({ control }: { control: Control<CreateAccountFormValues> }) {
  const { data } = useProviders();
  const providers = data ?? [];
  // Sticky "custom mode" flag: once set, the custom Input stays visible even
  // if the field is cleared by typing, so it doesn't collapse back to the
  // Select mid-edit. Set either by the user explicitly picking "Other…", or
  // by the effect below when an edit-loaded value doesn't match any known
  // provider — both cases must stay sticky the same way.
  const [forceCustom, setForceCustom] = useState(false);
  const watchedBankName = useWatch({ control, name: 'subtype.bankName' }) ?? '';
  const watchedMatched = providers.some((p) => p.displayName === watchedBankName);

  useEffect(() => {
    if (providers.length > 0 && watchedBankName !== '' && !watchedMatched) {
      setForceCustom(true);
    }
  }, [providers.length, watchedBankName, watchedMatched]);

  return (
    <FormField
      control={control}
      name="subtype.bankName"
      render={({ field }) => {
        if (providers.length === 0) {
          return (
            <FormItem>
              <FormLabel>Bank name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }

        const bankName = field.value ?? '';
        const matched = providers.find((p) => p.displayName === bankName);
        const isCustom = forceCustom || (bankName !== '' && !matched);
        // Always a string (never `undefined`) so the Select stays controlled
        // across renders — Radix shows the placeholder for `''` just the same.
        const selectValue = matched ? matched.displayName : isCustom ? CUSTOM_BANK_VALUE : '';

        return (
          <FormItem>
            <FormLabel>Bank name</FormLabel>
            <FormControl>
              <Select
                onValueChange={(value) => {
                  if (value === CUSTOM_BANK_VALUE) {
                    setForceCustom(true);
                    field.onChange('');
                  } else {
                    setForceCustom(false);
                    field.onChange(value);
                  }
                }}
                value={selectValue}
              >
                <SelectTrigger aria-label="Bank name">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.displayName}>
                      {p.displayName}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_BANK_VALUE}>Other…</SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            {isCustom && (
              <Input
                aria-label="Custom bank name"
                name={field.name}
                onBlur={field.onBlur}
                value={bankName}
                onChange={(e) => field.onChange(e.target.value)}
              />
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function SubtypeFields() {
  const { control, watch } = useFormContext<CreateAccountFormValues>();
  const kind = watch('subtype.type');

  if (kind === 'cash') {
    return (
      <FormField
        control={control}
        name="subtype.storageLocation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Storage location</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
  if (kind === 'bankAccount') {
    return (
      <>
        <BankNameField control={control} />
        <FormField
          control={control}
          name="subtype.accountNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account number</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.cardNetwork"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Card network</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_NETWORKS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {CARD_NETWORK_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'eWallet') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.accountIdentifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account identifier</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'asset') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.assetType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asset type</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {ASSET_TYPE_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'loan') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.lender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lender</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.interestRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interest rate (% APR)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due date (YYYY-MM-DD)</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  return null;
}
