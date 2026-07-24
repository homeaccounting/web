import { describe, it, expect } from 'vitest';
import {
  flattenDictionary,
  flattenDictionaryTree,
  entryPath,
  entryLeafName,
  resolveEntryPath,
  filterGroups,
  findGroupByName,
  filterItems,
  findItemByName,
} from './dictionary';
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

describe('filterGroups', () => {
  it('returns only group nodes (items excluded)', () => {
    expect(filterGroups(tree).map((n) => n.id)).toEqual(['food', 'misc']);
  });

  it('returns [] for an undefined dictionary', () => {
    expect(filterGroups(undefined)).toEqual([]);
  });
});

describe('findGroupByName', () => {
  const t: DictionaryResponse = {
    roots: [group('region', 'Region', [group('europe', 'Europe', [])]), item('salary', 'Salary')],
  };

  it('finds a group by full path, case-insensitively', () => {
    expect(findGroupByName(t, 'region / europe')?.id).toBe('europe');
  });

  it('returns undefined when no group matches', () => {
    expect(findGroupByName(t, 'Nope')).toBeUndefined();
  });

  it('does not match an item of the same name', () => {
    expect(findGroupByName(t, 'Salary')).toBeUndefined();
  });
});

describe('filterItems', () => {
  it('returns only item nodes (groups excluded), full paths preserved', () => {
    expect(filterItems(tree).map((n) => n.id)).toEqual(['groceries', 'dining', 'salary']);
  });

  it('returns [] for an undefined dictionary', () => {
    expect(filterItems(undefined)).toEqual([]);
  });
});

describe('findItemByName', () => {
  it('finds an item by full path, case-insensitively', () => {
    expect(findItemByName(tree, 'food / groceries')?.id).toBe('groceries');
  });

  it('returns undefined when no item matches', () => {
    expect(findItemByName(tree, 'Food / Nope')).toBeUndefined();
  });

  it('does not match a group of the same name', () => {
    // "Food" is a group, so it is not an assignable item.
    expect(findItemByName(tree, 'Food')).toBeUndefined();
  });
});

describe('resolveEntryPath', () => {
  // Food (group) -> Groceries; Salary (item) at root; Misc (empty group).
  // Nested: Region (group) -> Europe (group).
  const t: DictionaryResponse = {
    roots: [
      group('food', 'Food', [item('groceries', 'Groceries')]),
      item('salary', 'Salary'),
      group('region', 'Region', [group('europe', 'Europe', [])]),
    ],
  };

  it('creates at root (parentId null) with the trimmed name when there is no separator', () => {
    expect(resolveEntryPath(t, '  Silpo  ')).toEqual({ name: 'Silpo', parentId: null });
  });

  it('nests under an existing group when the parent path matches', () => {
    expect(resolveEntryPath(t, 'Food / Coffee')).toEqual({ name: 'Coffee', parentId: 'food' });
  });

  it('matches the group path case-insensitively', () => {
    expect(resolveEntryPath(t, 'food / Coffee')).toEqual({ name: 'Coffee', parentId: 'food' });
  });

  it('nests under a deeply-nested group by full parent path', () => {
    expect(resolveEntryPath(t, 'Region / Europe / Berlin')).toEqual({
      name: 'Berlin',
      parentId: 'europe',
    });
  });

  it('falls back to a root entry named as typed when the group does not exist', () => {
    expect(resolveEntryPath(t, 'Nope / Item')).toEqual({ name: 'Nope / Item', parentId: null });
  });

  it('does not nest under an item (only groups are parents)', () => {
    // "Salary" is an item, not a group, so "Salary / Bonus" stays a root literal.
    expect(resolveEntryPath(t, 'Salary / Bonus')).toEqual({
      name: 'Salary / Bonus',
      parentId: null,
    });
  });

  it('falls back to root for a trailing separator (empty leaf)', () => {
    expect(resolveEntryPath(t, 'Food / ')).toEqual({ name: 'Food /', parentId: null });
  });

  it('treats an undefined dictionary as root-only', () => {
    expect(resolveEntryPath(undefined, 'Food / Coffee')).toEqual({
      name: 'Food / Coffee',
      parentId: null,
    });
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
