import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConsistentAccountView } from './useConsistentAccountView';

// Proves the core "never lead the list" gating property in isolation, without
// any network/query machinery: the hook must hold its last value from the
// moment the paired (transactions) query was settled, and only adopt a new
// value once that query settles again.
describe('useConsistentAccountView', () => {
  it('returns the live value while steady (not fetching)', () => {
    const { result } = renderHook(() => useConsistentAccountView(1000, false, 'a1'));
    expect(result.current).toBe(1000);
  });

  it('holds the previous value while the paired query is fetching, even after the live value changes', () => {
    const { result, rerender } = renderHook(
      ({ balance, isFetching }: { balance: number; isFetching: boolean }) =>
        useConsistentAccountView(balance, isFetching, 'a1'),
      { initialProps: { balance: 1000, isFetching: false } },
    );
    expect(result.current).toBe(1000);

    // The fast balance source resolves a new value WHILE the slow list query
    // is still fetching — the gated value must not advance yet.
    rerender({ balance: 1200, isFetching: true });
    expect(result.current).toBe(1000);

    // Still fetching on a later render (e.g. balance settled but re-rendered
    // for an unrelated reason) — still held.
    rerender({ balance: 1200, isFetching: true });
    expect(result.current).toBe(1000);
  });

  it('adopts the new live value the instant the paired query settles', () => {
    const { result, rerender } = renderHook(
      ({ balance, isFetching }: { balance: number; isFetching: boolean }) =>
        useConsistentAccountView(balance, isFetching, 'a1'),
      { initialProps: { balance: 1000, isFetching: false } },
    );

    rerender({ balance: 1200, isFetching: true });
    expect(result.current).toBe(1000);

    // The list settles (isFetching flips to false) in the same render the new
    // balance is visible — the gate must release immediately, synchronously
    // with this render (no extra tick needed for the swap to be atomic).
    rerender({ balance: 1200, isFetching: false });
    expect(result.current).toBe(1200);
  });

  it('does not permanently stick: after settling, a further live change while steady passes straight through', () => {
    const { result, rerender } = renderHook(
      ({ balance, isFetching }: { balance: number; isFetching: boolean }) =>
        useConsistentAccountView(balance, isFetching, 'a1'),
      { initialProps: { balance: 1000, isFetching: false } },
    );

    rerender({ balance: 1200, isFetching: false });
    expect(result.current).toBe(1200);

    rerender({ balance: 1300, isFetching: false });
    expect(result.current).toBe(1300);
  });

  it('resets immediately (bypassing the hold) when the identity key changes, so switching accounts never bleeds in a stale balance', () => {
    const { result, rerender } = renderHook(
      ({ balance, isFetching, key }: { balance: number; isFetching: boolean; key: string }) =>
        useConsistentAccountView(balance, isFetching, key),
      { initialProps: { balance: 1000, isFetching: false, key: 'a1' } },
    );

    // a1 goes into a slow refetch holding its old balance.
    rerender({ balance: 1200, isFetching: true, key: 'a1' });
    expect(result.current).toBe(1000);

    // User switches to a different account (a2) while a1's fetch was still
    // pending. Even though the paired query for a2 may ALSO report fetching,
    // the gate must show a2's own live balance immediately rather than a1's
    // held value.
    rerender({ balance: 500, isFetching: true, key: 'a2' });
    expect(result.current).toBe(500);
  });
});
