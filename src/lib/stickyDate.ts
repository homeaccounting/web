import { toDateTimeInput, toDayInput } from '@/lib/dates';

// sessionStorage key. The stored value is JSON: { day, recordedOn } where
// `recordedOn` is the calendar day the value was written. Staleness is judged
// on `recordedOn` (has a new day begun since?), not on `day` itself — so a
// deliberately-picked PAST day still sticks within the same day. See
// docs/specs/2026-07-28-default-transaction-date-design.md.
export const STICKY_DATE_KEY = 'ha.transactions.lastDay';

interface StickyRecord {
  day: string; // 'YYYY-MM-DD'
  recordedOn: string; // 'YYYY-MM-DD'
}

function parse(raw: string | null): StickyRecord | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as StickyRecord).day === 'string' &&
      typeof (obj as StickyRecord).recordedOn === 'string'
    ) {
      return obj as StickyRecord;
    }
  } catch {
    // fall through
  }
  return null;
}

// The last-used day, or null if nothing usable is stored. Returns the stored
// day only when it was recorded today or later (ISO day strings compare
// lexicographically); a value recorded on an earlier calendar day (a tab left
// open across midnight) is treated as stale.
export function readStickyDay(now: Date): string | null {
  const rec = parse(sessionStorage.getItem(STICKY_DATE_KEY));
  if (!rec) return null;
  if (rec.recordedOn < toDayInput(now)) return null;
  return rec.day;
}

// Remember the day part of a picker value as the sticky day, stamped with
// today as `recordedOn`.
export function writeStickyDay(dateValue: string, now: Date): void {
  const day = dateValue.split('T')[0] ?? '';
  const rec: StickyRecord = { day, recordedOn: toDayInput(now) };
  sessionStorage.setItem(STICKY_DATE_KEY, JSON.stringify(rec));
}

// The default value for a new transaction's date picker: the sticky day (if
// any) with the current time, else "now". Composing with the current time
// keeps same-day rows distinctly, entry-ordered.
export function defaultTransactionDate(now: Date): string {
  const day = readStickyDay(now);
  if (!day) return toDateTimeInput(now);
  return `${day}T${toDateTimeInput(now).slice(11, 16)}`;
}
