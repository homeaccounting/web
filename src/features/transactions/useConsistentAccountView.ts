import { useEffect, useRef } from 'react';

/**
 * Gate a fast-resolving value so it never visually "leads" a paired,
 * slower-settling query — the concrete case being the account header balance
 * (from the fast `['accounts']` query) versus the transaction list (from the
 * multi-page `['transactions', …]` query, which settles atomically but
 * later). Without gating, an out-of-band change (bank import, sync signal)
 * shows the NEW balance beside the OLD list for the duration of the list
 * refetch — a visible contradiction.
 *
 * Returns `liveValue` while the paired query is settled (`isFetching` false).
 * While the paired query IS fetching, returns whatever `liveValue` was the
 * last time it was settled, so the balance and the list swap to the new
 * generation atomically — in the same render — once the list query settles.
 *
 * `resetKey` identifies WHAT is being displayed (e.g. the account id). When
 * it changes — the user switched accounts/scope, not an out-of-band update —
 * the hold resets synchronously to the new `liveValue` so a stale balance
 * from a different account can never bleed into the new one.
 */
export function useConsistentAccountView<T>(
  liveValue: T,
  isFetching: boolean,
  resetKey: unknown,
): T {
  const heldRef = useRef(liveValue);
  const prevKeyRef = useRef(resetKey);

  // Identity changed: resync immediately (during render, not via effect) so
  // the very next paint already shows the right thing being displayed's own
  // value, never a holdover from whatever was previously held.
  if (prevKeyRef.current !== resetKey) {
    prevKeyRef.current = resetKey;
    heldRef.current = liveValue;
  }

  useEffect(() => {
    if (!isFetching) {
      heldRef.current = liveValue;
    }
  }, [isFetching, liveValue]);

  return isFetching ? heldRef.current : liveValue;
}
