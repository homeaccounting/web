// Fixed palette of complete Tailwind class strings (literal so the JIT
// scanner emits them). Light + dark variants chosen for chip contrast.
export const LABEL_CHIP_PALETTE = [
  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
] as const;

// Stable hash → palette index, so a label always renders the same color.
export function labelChipClasses(labelId: string): string {
  let hash = 0;
  for (let i = 0; i < labelId.length; i += 1) {
    hash = (hash * 31 + labelId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % LABEL_CHIP_PALETTE.length;
  return LABEL_CHIP_PALETTE[idx]!;
}
