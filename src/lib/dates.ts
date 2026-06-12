import type { ISO8601 } from '@/api/types';

const pad = (n: number) => String(n).padStart(2, '0');

// Format a Date as a local 'YYYY-MM-DDTHH:MM' (minute precision) — the value
// shape a time-enabled DatePicker works with.
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local wall-clock 'YYYY-MM-DDTHH:MM' for "now". Used as the default value for
// a time-enabled DatePicker so a new transaction is stamped with the current
// time and same-day rows get distinct, entry-ordered timestamps out of the box.
export function nowDateTimeInput(): string {
  return toLocalInput(new Date());
}

// Convert a date-picker value (interpreted as LOCAL wall-clock time) to a real
// UTC ISO timestamp for the wire.
//  - 'YYYY-MM-DDTHH:MM' (time-enabled picker) -> that local instant in UTC
//  - 'YYYY-MM-DD'        (date-only)           -> local midnight in UTC
// Parsing local (not appending 'Z') is what keeps a picked time from landing
// in the future relative to the server's UTC clock — e.g. 22:39 in UTC+3 must
// be sent as 19:39Z, not 22:39Z.
export function dateInputToWire(v: string): ISO8601 {
  return new Date(v.includes('T') ? v : `${v}T00:00`).toISOString();
}

// Inverse of dateInputToWire for seeding a picker from a backend UTC timestamp:
// 'YYYY-MM-DDTHH:MM:SSZ' -> local 'YYYY-MM-DDTHH:MM'.
export function wireToDateInput(iso: string): string {
  return toLocalInput(new Date(iso));
}
