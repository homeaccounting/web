import { describe, it, expect } from 'vitest';
import { flattenDictionary, flattenDictionaryTree, entryPath, entryLeafName } from './dictionary';
import type { DictionaryResponse, DictionaryEntryNode } from './types';

const item = (id: string, name: string): DictionaryEntryNode => ({
  id,
  name,
  type: 'item',
  children: [],
});
const group = (id: string, name: string, children: DictionaryEntryNode[]): DictionaryEntryNode => ({
  id,
  name,
  type: 'group',
  children,
});

// Food (group) -> [Groceries, Dining]; Salary (item) at the root; Misc (empty group).
const tree: DictionaryResponse = {
  roots: [
    group('food', 'Food', [item('groceries', 'Groceries'), item('dining', 'Dining')]),
    item('salary', 'Salary'),
    group('misc', 'Misc', []),
  ],
};

describe('entryPath', () => {
  it('joins segments into a full path with the separator', () => {
    expect(entryPath(['Food', 'Groceries'])).toBe('Food / Groceries');
  });

  it('returns a single segment unchanged', () => {
    expect(entryPath(['Salary'])).toBe('Salary');
  });

  it('is the inverse spirit of entryLeafName for a round trip', () => {
    const path = entryPath(['Housing', 'Rent']);
    expect(entryLeafName(path)).toBe('Rent');
  });
});

describe('entryLeafName', () => {
  it('returns the last segment of a full path', () => {
    expect(entryLeafName('Food / Groceries')).toBe('Groceries');
  });

  it('returns a root (unnested) name unchanged', () => {
    expect(entryLeafName('Salary')).toBe('Salary');
  });
});

describe('flattenDictionary', () => {
  it('returns [] for an undefined dictionary', () => {
    expect(flattenDictionary(undefined)).toEqual([]);
  });

  it('yields only items (groups are non-assignable), with full-path names', () => {
    expect(flattenDictionary(tree)).toEqual([
      { id: 'groceries', name: 'Food / Groceries' },
      { id: 'dining', name: 'Food / Dining' },
      { id: 'salary', name: 'Salary' },
    ]);
  });

  it('drops empty groups entirely', () => {
    // "Misc" contributes no rows because it has no item descendants.
    expect(flattenDictionary(tree).some((e) => e.id === 'misc')).toBe(false);
  });
});

describe('flattenDictionaryTree', () => {
  it('returns [] for an undefined dictionary', () => {
    expect(flattenDictionaryTree(undefined)).toEqual([]);
  });

  it('pre-order flattens every node with role, depth, parentId and full path', () => {
    expect(flattenDictionaryTree(tree)).toEqual([
      { id: 'food', name: 'Food', path: 'Food', type: 'group', depth: 0, parentId: null },
      {
        id: 'groceries',
        name: 'Groceries',
        path: 'Food / Groceries',
        type: 'item',
        depth: 1,
        parentId: 'food',
      },
      {
        id: 'dining',
        name: 'Dining',
        path: 'Food / Dining',
        type: 'item',
        depth: 1,
        parentId: 'food',
      },
      { id: 'salary', name: 'Salary', path: 'Salary', type: 'item', depth: 0, parentId: null },
      { id: 'misc', name: 'Misc', path: 'Misc', type: 'group', depth: 0, parentId: null },
    ]);
  });
});
