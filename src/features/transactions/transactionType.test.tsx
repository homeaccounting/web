import { describe, expect, it } from 'vitest';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Scale } from 'lucide-react';
import { transactionAmountClass, transactionTypeMeta } from './transactionType';

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

  it('income is positive-toned, expense is negative-toned (red), transfer is info-toned', () => {
    expect(transactionTypeMeta('income').colorClass).toContain('positive');
    expect(transactionTypeMeta('expense').colorClass).toContain('negative');
    expect(transactionTypeMeta('transfer').colorClass).toContain('info');
  });

  it('falls back for an unknown type', () => {
    const meta = transactionTypeMeta('weird');
    expect(meta.label).toBe('weird');
    expect(meta.Icon).toBeTypeOf('object');
  });
});

describe('transactionAmountClass', () => {
  it('colors income green and expense red', () => {
    expect(transactionAmountClass('income')).toBe('text-positive');
    expect(transactionAmountClass('expense')).toBe('text-negative');
  });

  it('leaves transfer and adjustment neutral (red/green is only for external-account income/expense)', () => {
    expect(transactionAmountClass('transfer')).toBe('');
    expect(transactionAmountClass('adjustment')).toBe('');
  });

  it('leaves an unknown type neutral', () => {
    expect(transactionAmountClass('weird')).toBe('');
  });
});
