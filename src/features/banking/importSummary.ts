import i18n from '@/lib/i18n';
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
  // Call-time translation: this runs when the toast fires, not at module load.
  const parts = [i18n.t('banking:summary.imported', { count: s.imported })];
  if (s.skipped > 0) parts.push(i18n.t('banking:summary.skipped', { count: s.skipped }));
  if (s.failed > 0) parts.push(i18n.t('banking:summary.failed', { count: s.failed }));
  if (s.unresolved > 0) parts.push(i18n.t('banking:summary.unresolved', { count: s.unresolved }));
  return parts.join(' · ');
}
