// locale === undefined → international neutral default (unchanged behavior).
export function formatMoney(amount: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale ?? 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amount);
}

export function formatDate(isoTimestamp: string, locale?: string): string {
  if (!locale) return isoTimestamp.slice(0, 10); // international default: ISO 8601 (UTC date)
  // Date-only display: show the same UTC calendar day in every locale — only the
  // format (order/separators) changes with country, never which day.
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(new Date(isoTimestamp));
}

// Local 'YYYY-MM-DD HH:MM' from a backend UTC ISO timestamp. Shown in the
// transactions list so same-day rows display their (sortable) time in the
// viewer's timezone — matching what was entered in the time-enabled picker.
// locale === undefined → international default (as above); otherwise
// locale-ordered date + 24-hour time, still rendered in the viewer's timezone.
export function formatDateTime(isoTimestamp: string, locale?: string): string {
  if (!locale) {
    const d = new Date(isoTimestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(isoTimestamp));
}
