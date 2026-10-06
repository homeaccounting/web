// Round to 2-decimal money precision. Keeps money arithmetic free of binary
// float noise (e.g. 0.1 + 0.2) and lets comparisons agree on "equal cents".
export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

const isPositive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

export const convertAmount = (amount: unknown, rate: unknown): number | undefined =>
  isPositive(amount) && isPositive(rate) ? roundMoney(amount * rate) : undefined;

// The backend applies the rate as an exact rational with no rounding, so the
// rate must carry enough digits for `amount * rate` to land on the entered
// target; 12 significant digits keep the error far below a cent while
// stripping binary float noise (92.37 / 100 → 0.9237, not 0.9237000000000001).
export const deriveExchangeRate = (amount: unknown, target: unknown): number | undefined =>
  isPositive(amount) && isPositive(target) ? Number((target / amount).toPrecision(12)) : undefined;
