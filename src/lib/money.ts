// Round to 2-decimal money precision. Keeps money arithmetic free of binary
// float noise (e.g. 0.1 + 0.2) and lets comparisons agree on "equal cents".
export const roundMoney = (n: number): number => Math.round(n * 100) / 100;
