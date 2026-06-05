import { describe, it, expect } from 'vitest';
import { configurationFixture } from './fixtures';

describe('configurationFixture', () => {
  it('exposes baseCurrencyEditable', () => {
    expect(configurationFixture.baseCurrencyEditable).toBe(true);
  });
});
