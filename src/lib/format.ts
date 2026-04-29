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
