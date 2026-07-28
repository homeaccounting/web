import { useCallback, useEffect, useRef, useState } from 'react';
import type { UUID } from '@/api/types';

// Owns the transaction multi-selection for the pane. `resetKey` is any string
// the caller derives from the current scope (account + date window + filters);
// when it changes the selection clears, so we never act on rows hidden by a
// different scope. Page index is deliberately NOT part of the key, so a
// selection survives pagination (enabling a cross-page merge).
export interface TransactionSelection {
  selectedIds: Set<UUID>;
  isSelected: (id: UUID) => boolean;
  toggle: (id: UUID) => void;
  // Bulk set (header select-all / clear-all over a page's rows).
  setMany: (ids: UUID[], selected: boolean) => void;
  // Collapse the selection to exactly one row (file-manager right-click).
  setOnly: (id: UUID) => void;
  clear: () => void;
  count: number;
}

export function useTransactionSelection(resetKey: string): TransactionSelection {
  const [selectedIds, setSelectedIds] = useState<Set<UUID>>(() => new Set());

  // Clear when the scope key changes. Tracking the previous key in a ref (rather
  // than resetting inside render) keeps the effect the single source of truth and
  // avoids a double-render on the first commit.
  const prevKey = useRef(resetKey);
  useEffect(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      setSelectedIds(new Set());
    }
  }, [resetKey]);

  const toggle = useCallback((id: UUID) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: UUID[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const setOnly = useCallback((id: UUID) => setSelectedIds(new Set([id])), []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const isSelected = useCallback((id: UUID) => selectedIds.has(id), [selectedIds]);

  return { selectedIds, isSelected, toggle, setMany, setOnly, clear, count: selectedIds.size };
}
