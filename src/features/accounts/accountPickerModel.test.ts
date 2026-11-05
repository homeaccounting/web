import { describe, it, expect } from 'vitest';
import type { AccountResponse, AccountRole, AccountStatus } from '@/api/types';
import { buildPickerModel, filterPickerKinds, pickerAccountIds } from './accountPickerModel';

function acc(
  id: string,
  subtype: Record<string, unknown>,
  opts: { currency?: string; role?: AccountRole; status?: AccountStatus } = {},
): AccountResponse {
  return {
    id,
    name: id,
    balance: 0,
    currency: opts.currency ?? 'UAH',
    overdraftLimit: null,
    subtype: subtype as AccountResponse['subtype'],
    status: opts.status ?? 'Opened',
    role: opts.role ?? 'owner',
    version: 1,
  };
}

const bank = (id: string, bankName: string, currency?: string) =>
  acc(id, { type: 'bankAccount', bankName }, { currency });

describe('buildPickerModel', () => {
  it('stays flat for a small single-kind list', () => {
    const model = buildPickerModel([bank('a', 'Mono'), bank('b', 'Privat')]);
    expect(model.showHeaders).toBe(false);
    expect(model.showSearch).toBe(false);
    expect(pickerAccountIds(model.kinds)).toEqual(['a', 'b']);
  });

  it('shows headers for several kinds, in the sidebar order', () => {
    const model = buildPickerModel([
      bank('card', 'Mono'),
      acc('wallet', { type: 'cash' }),
      acc('shared', { type: 'cash' }, { role: 'viewer' }),
      acc('mystery', { type: 'crypto' }),
    ]);
    expect(model.showHeaders).toBe(true);
    expect(model.kinds.map((k) => k.key)).toEqual(['cash', 'bankAccount', 'other', 'shared']);
    expect(model.kinds[0]).toMatchObject({ label: 'Cash' });
    expect(model.kinds[0]!.sections[0]).toMatchObject({ subLabel: null, ariaLabel: 'Cash' });
  });

  it('turns sidebar sub-groups into labelled sections and shows search above 5', () => {
    const model = buildPickerModel([
      bank('m1', 'Mono'),
      bank('m2', 'Mono'),
      bank('m3', 'Mono'),
      bank('p1', 'Privat'),
      bank('p2', 'Privat'),
      bank('p3', 'Privat'),
    ]);
    expect(model.showHeaders).toBe(true);
    expect(model.showSearch).toBe(true);
    expect(model.kinds).toHaveLength(1);
    expect(model.kinds[0]!.sections.map((s) => [s.subLabel, s.ariaLabel])).toEqual([
      ['Mono', 'Bank account, Mono'],
      ['Privat', 'Bank account, Privat'],
    ]);
  });

  it('puts closed accounts last in their own group, as the sidebar does', () => {
    const model = buildPickerModel([
      bank('open', 'Mono'),
      acc('old', { type: 'cash' }, { status: 'Closed' }),
      acc('shared', { type: 'cash' }, { role: 'viewer' }),
    ]);
    expect(model.showHeaders).toBe(true);
    expect(model.kinds.map((k) => k.key)).toEqual(['bankAccount', 'shared', 'closed']);
    expect(model.kinds[2]).toMatchObject({ label: 'Closed' });
    expect(model.kinds[2]!.sections[0]).toMatchObject({ ariaLabel: 'Closed' });
    expect(pickerAccountIds(model.kinds)).toEqual(['open', 'shared', 'old']);
  });

  it('shows search but no headers for many accounts of one kind at one bank', () => {
    const model = buildPickerModel(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => bank(id, 'Mono')));
    expect(model.showHeaders).toBe(false);
    expect(model.showSearch).toBe(true);
  });
});

describe('buildPickerModel recent', () => {
  const six = ['a', 'b', 'c', 'd', 'e'].map((id) => bank(id, 'Mono'));
  const many = [...six, acc('w', { type: 'cash' })];

  it('leads with a Recent group, in the given order, keeping rows in their own groups', () => {
    const model = buildPickerModel(many, ['w', 'gone', 'c']);
    expect(model.showHeaders).toBe(true);
    expect(model.kinds.map((k) => k.key)).toEqual(['recent', 'cash', 'bankAccount']);
    expect(model.kinds[0]).toMatchObject({ label: 'Recent' });
    expect(pickerAccountIds(model.kinds)).toEqual(['w', 'c', 'w', 'a', 'b', 'c', 'd', 'e']);
  });

  it('omits Recent when none of its ids are offered', () => {
    expect(buildPickerModel(many, ['gone']).kinds.map((k) => k.key)).toEqual([
      'cash',
      'bankAccount',
    ]);
  });

  it('omits Recent for short lists', () => {
    expect(buildPickerModel(six, ['a']).kinds.map((k) => k.key)).toEqual(['bankAccount']);
  });

  it('hides Recent while searching', () => {
    const kinds = filterPickerKinds(buildPickerModel(many, ['c']).kinds, 'c');
    expect(kinds.map((k) => k.key)).not.toContain('recent');
  });
});

describe('filterPickerKinds', () => {
  const model = buildPickerModel([
    acc('wallet', { type: 'cash' }, { currency: 'USD' }),
    bank('m1', 'Mono'),
    bank('m2', 'Mono', 'USD'),
    bank('m3', 'Mono'),
    bank('p1', 'Privat'),
    bank('p2', 'Privat'),
    bank('p3', 'Privat'),
  ]);

  it('returns the kinds unchanged for a blank query', () => {
    expect(filterPickerKinds(model.kinds, '  ')).toBe(model.kinds);
  });

  it('filters rows inside the fixed structure and drops empty sections and kinds', () => {
    const kinds = filterPickerKinds(model.kinds, 'mono');
    expect(kinds.map((k) => k.key)).toEqual(['bankAccount']);
    expect(kinds[0]!.sections.map((s) => s.subLabel)).toEqual(['Mono']);
    expect(pickerAccountIds(kinds)).toEqual(['m1', 'm2', 'm3']);
  });

  it('keeps sub-sections even when few rows match', () => {
    const kinds = filterPickerKinds(model.kinds, 'usd');
    expect(kinds.map((k) => k.key)).toEqual(['cash', 'bankAccount']);
    expect(kinds[1]!.sections.map((s) => s.subLabel)).toEqual(['Mono']);
  });

  it('returns no kinds when nothing matches', () => {
    expect(filterPickerKinds(model.kinds, 'zzz')).toEqual([]);
  });
});
