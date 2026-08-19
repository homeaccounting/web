import { describe, expect, it } from 'vitest';

import type { BankProviderDTO } from '@/api/types';

import { partitionProvidersByCountry } from './partitionProvidersByCountry';

const mk = (id: string, inUserCountry: boolean, countries: string[] = ['UA']): BankProviderDTO => ({
  id,
  displayName: id,
  supportsPull: false,
  supportsFile: true,
  countries,
  inUserCountry,
});

describe('partitionProvidersByCountry', () => {
  it('splits on inUserCountry, preserving input order', () => {
    const a = mk('a', true);
    const b = mk('b', false);
    const c = mk('c', true);

    expect(partitionProvidersByCountry([a, b, c])).toEqual({
      inCountry: [a, c],
      otherCountries: [b],
    });
  });

  it('puts everything in inCountry when all are in the user country', () => {
    const a = mk('a', true);
    const b = mk('b', true);

    expect(partitionProvidersByCountry([a, b])).toEqual({
      inCountry: [a, b],
      otherCountries: [],
    });
  });

  it('puts everything in otherCountries when none are in the user country', () => {
    const a = mk('a', false);
    const b = mk('b', false);

    expect(partitionProvidersByCountry([a, b])).toEqual({
      inCountry: [],
      otherCountries: [a, b],
    });
  });

  it('returns empty partitions for empty input', () => {
    expect(partitionProvidersByCountry([])).toEqual({
      inCountry: [],
      otherCountries: [],
    });
  });
});
