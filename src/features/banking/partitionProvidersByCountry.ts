import type { BankProviderDTO } from '@/api/types';

export interface ProviderPartition {
  inCountry: BankProviderDTO[];
  otherCountries: BankProviderDTO[];
}

export function partitionProvidersByCountry(providers: BankProviderDTO[]): ProviderPartition {
  const inCountry: BankProviderDTO[] = [];
  const otherCountries: BankProviderDTO[] = [];
  for (const p of providers) (p.inUserCountry ? inCountry : otherCountries).push(p);
  return { inCountry, otherCountries };
}
