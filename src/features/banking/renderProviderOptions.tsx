import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
import i18n from '@/lib/i18n';
import type { BankProviderDTO } from '@/api/types';
import { countryName } from '@/features/configuration/localizationLabels';
import { partitionProvidersByCountry } from './partitionProvidersByCountry';

// Country-aware provider options for a Radix `Select`. When every provider is
// in the user's country the render stays a flat list (today's behavior);
// otherwise in-country providers come first, followed by an "Other countries"
// group whose items carry their country name so cross-border providers are
// legible.
//
// `getValue` supplies each item's `value`, since callers key on different
// fields: BankConnectionDialog stores the provider id, SubtypeFields stores the
// bank display name.
export function renderProviderOptions(
  providers: BankProviderDTO[],
  getValue: (provider: BankProviderDTO) => string,
) {
  const { inCountry, otherCountries } = partitionProvidersByCountry(providers);

  if (otherCountries.length === 0) {
    return inCountry.map((p) => (
      <SelectItem key={p.id} value={getValue(p)}>
        {p.displayName}
      </SelectItem>
    ));
  }

  return (
    <>
      {inCountry.length > 0 && (
        <SelectGroup>
          {inCountry.map((p) => (
            <SelectItem key={p.id} value={getValue(p)}>
              {p.displayName}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
      <SelectGroup>
        <SelectLabel>{i18n.t('banking:providerOptions.otherCountries')}</SelectLabel>
        {otherCountries.map((p) => (
          <SelectItem key={p.id} value={getValue(p)}>
            {p.countries?.[0] ? `${p.displayName} — ${countryName(p.countries[0])}` : p.displayName}
          </SelectItem>
        ))}
      </SelectGroup>
    </>
  );
}
