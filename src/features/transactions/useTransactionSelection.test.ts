import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTransactionSelection } from './useTransactionSelection';

describe('useTransactionSelection', () => {
  it('toggles an id on and off', () => {
    const { result } = renderHook(() => useTransactionSelection('k'));
    expect(result.current.count).toBe(0);

    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('setMany selects and deselects a batch of ids', () => {
    const { result } = renderHook(() => useTransactionSelection('k'));

    act(() => result.current.setMany(['a', 'b', 'c'], true));
    expect(result.current.count).toBe(3);
    expect(result.current.isSelected('b')).toBe(true);

    act(() => result.current.setMany(['a', 'c'], false));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('setOnly replaces the selection with a single id', () => {
    const { result } = renderHook(() => useTransactionSelection('k'));
    act(() => result.current.setMany(['a', 'b', 'c'], true));
    expect(result.current.count).toBe(3);
    act(() => result.current.setOnly('b'));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('clear empties the selection', () => {
    const { result } = renderHook(() => useTransactionSelection('k'));
    act(() => result.current.setMany(['a', 'b'], true));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it('clears selection when the resetKey changes', () => {
    const { result, rerender } = renderHook(({ k }) => useTransactionSelection(k), {
      initialProps: { k: 'scope-1' },
    });
    act(() => result.current.setMany(['a', 'b'], true));
    expect(result.current.count).toBe(2);

    rerender({ k: 'scope-2' });
    expect(result.current.count).toBe(0);
  });

  it('preserves selection across rerenders with a stable resetKey', () => {
    const { result, rerender } = renderHook(({ k }) => useTransactionSelection(k), {
      initialProps: { k: 'scope-1' },
    });
    act(() => result.current.toggle('a'));
    rerender({ k: 'scope-1' });
    expect(result.current.isSelected('a')).toBe(true);
  });
});
