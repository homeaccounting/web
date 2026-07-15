import type { ImportResponse } from '@/api/types';

// Shared toast-summary helpers for both banking import flows (pull sync via
// SyncNowButton and statement-file upload via ImportStatementButton). Both
// endpoints return the same `ImportResponse` shape.

export interface Summary {
  imported: number;
  skipped: number;
  failed: number;
  unresolved: number;
}

export function summarize(result: ImportResponse): Summary {
  const totals = result.accounts.reduce(
    (acc, r) => ({
      imported: acc.imported + r.importedCount,
      skipped: acc.skipped + r.skipped.length,
      failed: acc.failed + r.failureCount,
    }),
    { imported: 0, skipped: 0, failed: 0 },
  );
  return { ...totals, unresolved: result.unresolved.length };
}

/** Human-friendly summary; only surfaces skipped/failed/unresolved when non-zero. */
export function formatSummary(s: Summary): string {
  const parts = [`Imported ${s.imported} transaction${s.imported === 1 ? '' : 's'}`];
  if (s.skipped > 0) parts.push(`${s.skipped} skipped`);
  if (s.failed > 0) parts.push(`${s.failed} failed`);
  if (s.unresolved > 0) {
    const noun = s.unresolved === 1 ? 'row needs' : 'rows need';
    parts.push(`${s.unresolved} ${noun} attention`);
  }
  return parts.join(' · ');
}
