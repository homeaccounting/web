import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { renderProviderOptions } from '@/features/banking/renderProviderOptions';
import type { CreateAccountFormValues } from './schema';
import { assetTypeLabel, cardNetworkLabel } from './labels';

// Radix `SelectItem` cannot use an empty-string value, so "Other…" (custom
// bank name entry) gets its own sentinel — same idiom as AccountSelect's
// NONE_VALUE / LinkAccountsDialog's NOT_IMPORTED.
const CUSTOM_BANK_VALUE = '__custom__';

// Provider Select + custom-entry fallback for `subtype.bankName`. Fails soft
// to a plain text Input when the provider list is empty/unavailable (loading,
// errored, or genuinely empty) — see useProviders().
function BankNameField({ control }: { control: Control<CreateAccountFormValues> }) {
  const { t } = useTranslation('accounts');
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
              <FormLabel>{t('subtypeFields.bankName')}</FormLabel>
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
            <FormLabel>{t('subtypeFields.bankName')}</FormLabel>
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
                <SelectTrigger aria-label={t('subtypeFields.bankName')}>
                  <SelectValue placeholder={t('subtypeFields.selectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {renderProviderOptions(providers, (p) => p.displayName)}
                  <SelectItem value={CUSTOM_BANK_VALUE}>{t('subtypeFields.otherOption')}</SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            {isCustom && (
              <Input
                aria-label={t('subtypeFields.customBankName')}
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
  const { t } = useTranslation('accounts');
  const { control, watch } = useFormContext<CreateAccountFormValues>();
  const kind = watch('subtype.type');

  if (kind === 'cash') {
    return (
      <FormField
        control={control}
        name="subtype.storageLocation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('subtypeFields.storageLocation')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.accountNumber')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.cardNetwork')}</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('subtypeFields.selectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_NETWORKS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {cardNetworkLabel(kind)}
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
              <FormLabel>{t('subtypeFields.provider')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.accountIdentifier')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.assetType')}</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('subtypeFields.selectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {assetTypeLabel(kind)}
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
              <FormLabel>{t('subtypeFields.description')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.lender')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.interestRate')}</FormLabel>
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
              <FormLabel>{t('subtypeFields.dueDate')}</FormLabel>
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
