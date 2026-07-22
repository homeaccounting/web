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

// Flatten a dictionary into the flat `{ id, name }` list the pickers consume.
// Mirrors the backend `entryAssignable` predicate (ADR 002): only items are
// assignable — groups are pure containers and are dropped from the selectable
// list. Each item's `name` is its full path so a leaf reads unambiguously
// (e.g. "Food / Groceries").
export function flattenDictionary(dict: DictionaryResponse | undefined): DictionaryEntryResponse[] {
  return flattenDictionaryTree(dict)
    .filter((node) => node.type === 'item')
    .map((node) => ({ id: node.id, name: node.path }));
}
