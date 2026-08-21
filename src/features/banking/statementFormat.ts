// Maps a picked statement file to the `format` query param the backend's
// file-import endpoints expect (`csv` → StatementCsv, `xlsx` → StatementXlsx;
// see server-infra Web/API/BankingAPI.hs `parseUrlPiece`). The provider DTO
// does not advertise which format a provider accepts, so the format is derived
// from the file extension — provider-agnostic, so any future CSV/XLSX file
// provider works with no web change.

import i18n from '@/lib/i18n';

// `accept` value for the statement-file inputs, covering both formats.
export const STATEMENT_FILE_ACCEPT =
  '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Call-time translation: resolved inside statementFormatForFiles, not at load.
const mixedOrUnknown = () => i18n.t('banking:statement.mixedOrUnknownFormat');

function formatForName(name: string): 'csv' | 'xlsx' | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return undefined;
}

// All files in one upload share a single `format` query param (the backend
// concatenates them into one batch), so the whole selection must resolve to one
// known format; otherwise return a user-facing error and send nothing.
export function statementFormatForFiles(
  files: File[],
): { format: 'csv' | 'xlsx' } | { error: string } {
  if (files.length === 0) return { error: mixedOrUnknown() };
  const formats = new Set<'csv' | 'xlsx'>();
  for (const f of files) {
    const fmt = formatForName(f.name);
    if (!fmt) return { error: mixedOrUnknown() };
    formats.add(fmt);
  }
  if (formats.size !== 1) return { error: mixedOrUnknown() };
  return { format: [...formats][0]! };
}
