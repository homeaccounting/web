export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amount);
}

export function formatDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

// Local 'YYYY-MM-DD HH:MM' from a backend UTC ISO timestamp. Shown in the
// transactions list so same-day rows display their (sortable) time in the
// viewer's timezone — matching what was entered in the time-enabled picker.
export function formatDateTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
