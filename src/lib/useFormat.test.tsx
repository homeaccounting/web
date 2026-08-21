import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormat } from './useFormat';

vi.mock('@/features/configuration/useConfiguration', () => ({
  useConfiguration: vi.fn(),
}));
import { useConfiguration } from '@/features/configuration/useConfiguration';

describe('useFormat', () => {
  it('binds formatters to the config COUNTRY locale', () => {
    vi.mocked(useConfiguration).mockReturnValue({ data: { country: 'UA' } } as never);
    const { result } = renderHook(() => useFormat());
    expect(result.current.formatDate('2026-03-09T00:00:00Z')).toBe('09.03.2026');
  });

  it('uses US formatting only for country US', () => {
    vi.mocked(useConfiguration).mockReturnValue({ data: { country: 'US' } } as never);
    const { result } = renderHook(() => useFormat());
    expect(result.current.formatDate('2026-03-09T00:00:00Z')).toBe('3/9/2026');
  });

  it('uses the international default (ISO) when no country', () => {
    vi.mocked(useConfiguration).mockReturnValue({ data: { country: null } } as never);
    const { result } = renderHook(() => useFormat());
    expect(result.current.formatDate('2026-03-09T00:00:00Z')).toBe('2026-03-09');
  });
});
