import { populatedSeed, freshSeed, type DemoSeed } from './corpus';

export type SeedVariant = 'populated' | 'fresh';

export function getSeed(variant: SeedVariant): DemoSeed {
  return variant === 'fresh' ? freshSeed : populatedSeed;
}

export { AS_OF } from './corpus';
export type { DemoSeed } from './corpus';
