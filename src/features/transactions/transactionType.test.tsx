import { describe, expect, it } from 'vitest';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Scale } from 'lucide-react';
import { transactionTypeMeta } from './transactionType';

describe('transactionTypeMeta', () => {
  it('maps each known type to its icon, color, and label', () => {
    expect(transactionTypeMeta('income')).toMatchObject({ Icon: ArrowDownToLine, label: 'Income' });
    expect(transactionTypeMeta('expense')).toMatchObject({
      Icon: ArrowUpFromLine,
      label: 'Expense',
    });
    expect(transactionTypeMeta('transfer')).toMatchObject({
      Icon: ArrowLeftRight,
      label: 'Transfer',
    });
    expect(transactionTypeMeta('adjustment')).toMatchObject({ Icon: Scale, label: 'Adjustment' });
  });

  it('income is green, expense is destructive (red)', () => {
    expect(transactionTypeMeta('income').colorClass).toContain('green');
    expect(transactionTypeMeta('expense').colorClass).toContain('destructive');
  });

  it('falls back for an unknown type', () => {
    const meta = transactionTypeMeta('weird');
    expect(meta.label).toBe('weird');
    expect(meta.Icon).toBeTypeOf('object');
  });
});
