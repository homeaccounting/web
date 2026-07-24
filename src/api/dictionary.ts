import type { DictionaryResponse, DictionaryEntryNode, DictionaryEntryResponse } from './types';

// Separator used when rendering a nested entry as a single-line full path,
// e.g. a "Groceries" item under the "Food" group becomes "Food / Groceries".
export const PATH_SEPARATOR = ' / ';

// Build a full entry path ("Food / Groceries") from its ordered segments
// (ancestor group names ending in the entry's own name). Works for any
// dictionary — categories, labels, contacts.
export function entryPath(segments: string[]): string {
  return segments.join(PATH_SEPARATOR);
}

// The leaf (own) name of a full entry path: "Food / Groceries" -> "Groceries",
// "Salary" -> "Salary". Use in compact/fixed-width UI (chips, dense cells)
// where the full path is surfaced elsewhere (e.g. a tooltip).
export function entryLeafName(path: string): string {
  const segments = path.split(PATH_SEPARATOR);
  return segments[segments.length - 1] ?? path;
}

// A dictionary node projected into a flat row, carrying the structural facts
// (role, depth, parentId) the management UI needs plus both the node's own
// `name` and its `path` (ancestor names joined by PATH_SEPARATOR).
export interface FlatDictionaryNode {
  id: string;
  name: string;
  path: string;
  type: DictionaryEntryNode['type'];
  depth: number;
  parentId: string | null;
}

// Pre-order walk of a dictionary tree, threading each node's ancestry so we can
// compute its depth, parentId, and full path as we go.
function walk(
  nodes: DictionaryEntryNode[],
  parentId: string | null,
  parentPath: string,
  depth: number,
  out: FlatDictionaryNode[],
): void {
  for (const node of nodes) {
    const path = entryPath(parentPath ? [parentPath, node.name] : [node.name]);
    out.push({ id: node.id, name: node.name, path, type: node.type, depth, parentId });
    walk(node.children, node.id, path, depth + 1, out);
  }
}

// Flatten a dictionary's tree into every node as a `FlatDictionaryNode`, in
// pre-order. This is the structural view the management UI renders and derives
// its group list / parent options from.
export function flattenDictionaryTree(dict: DictionaryResponse | undefined): FlatDictionaryNode[] {
  if (!dict?.roots) return [];
  const out: FlatDictionaryNode[] = [];
  walk(dict.roots, null, '', 0, out);
  return out;
}

// The group (container) nodes of a dictionary, flattened — the assignable
// parents an item can be nested under. Items are excluded (they can't be parents).
export function filterGroups(dict: DictionaryResponse | undefined): FlatDictionaryNode[] {
  return flattenDictionaryTree(dict).filter((node) => node.type === 'group');
}

// Find a group by its full path (e.g. "Region / Europe"), case-insensitively, or
// `undefined` when no group matches. Only groups are considered — a matching item
// is not a parent.
export function findGroupByName(
  dict: DictionaryResponse | undefined,
  path: string,
): FlatDictionaryNode | undefined {
  const target = path.trim().toLowerCase();
  return filterGroups(dict).find((node) => node.path.toLowerCase() === target);
}

// The item (leaf) nodes of a dictionary, flattened — the assignable entries.
// Groups are excluded. (Mirrors `filterGroups`; see `flattenDictionary` for the
// picker-facing `{ id, name }` projection of the same set.)
export function filterItems(dict: DictionaryResponse | undefined): FlatDictionaryNode[] {
  return flattenDictionaryTree(dict).filter((node) => node.type === 'item');
}

// Find an item by its full path (e.g. "Food / Groceries"), case-insensitively, or
// `undefined` when no item matches. Only items are considered — a matching group
// is not an assignable entry. Useful for detecting an existing entry before a
// create-by-path.
export function findItemByName(
  dict: DictionaryResponse | undefined,
  path: string,
): FlatDictionaryNode | undefined {
  const target = path.trim().toLowerCase();
  return filterItems(dict).find((node) => node.path.toLowerCase() === target);
}

// Interpret a typed entry name as an optional full path ("Group1 / Item1") when
// creating a new dictionary ITEM. If the leading segment(s) resolve to an
// EXISTING group in `dict`, the entry is nested under it (returns the leaf name
// + that group's id as parentId). Otherwise — no separator, or the named group
// doesn't exist, or a segment resolves to an item rather than a group — the
// entry is created at the ROOT with the name exactly as typed (trimmed). Group
// matching is case-insensitive on the full parent path. Never auto-creates
// groups (see the contact-dictionary spec: a noisy import description must not
// silently spawn junk groups).
export function resolveEntryPath(
  dict: DictionaryResponse | undefined,
  typedName: string,
): { name: string; parentId: string | null } {
  const raw = typedName.trim();
  const segments = raw.split(PATH_SEPARATOR).map((s) => s.trim());
  if (segments.length < 2) return { name: raw, parentId: null };
  const leaf = segments[segments.length - 1]!;
  const group = findGroupByName(dict, segments.slice(0, -1).join(PATH_SEPARATOR));
  if (!leaf || !group) return { name: raw, parentId: null };
  return { name: leaf, parentId: group.id };
}

// Flatten a dictionary into the flat `{ id, name }` list the pickers consume.
// Mirrors the backend `entryAssignable` predicate (ADR 002): only items are
// assignable — groups are pure containers and are dropped from the selectable
// list. Each item's `name` is its full path so a leaf reads unambiguously
// (e.g. "Food / Groceries").
export function flattenDictionary(dict: DictionaryResponse | undefined): DictionaryEntryResponse[] {
  return filterItems(dict).map((node) => ({ id: node.id, name: node.path }));
}
