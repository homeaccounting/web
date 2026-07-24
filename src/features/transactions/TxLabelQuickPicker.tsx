import { useEffect, useRef, useState } from 'react';
import { Tags } from 'lucide-react';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface TxLabelQuickPickerProps {
  options: DictionaryEntryResponse[];
  value: UUID[]; // the transaction's current labels
  onCommit: (labels: UUID[]) => Promise<unknown>;
  // Creates the dictionary entry and returns its new id (null on failure). The
  // ASSIGNMENT is owned here: the returned id is appended through the SAME
  // serialized commit path as a toggle, so a create followed by a rapid toggle
  // can't race two unserialized full-array PUTs and drop a label.
  onCreate: (name: string) => Promise<UUID | null>;
  createHint?: string;
}

// Multi-select labels submenu. Each toggle optimistically updates local state
// and fires a full-array PUT. The submenu stays open across toggles.
//
// Concurrency: a `selectedRef` mirrors the latest selection so rapid toggles
// compose cumulatively (each PUT carries the full desired set), and the PUTs are
// serialized through a promise chain so the server applies them in order —
// otherwise two concurrent full-array PUTs could land out of order and persist a
// stale set. On failure we undo just that toggle relative to the *latest* state
// (not a stale snapshot), which stays correct when other toggles have landed
// since. (A refetch can't reconcile this: the cache never held the optimistic
// value, so server truth is reference-equal to it and TanStack's structural
// sharing skips the re-render that would re-seed us.)
export function TxLabelQuickPicker({
  options,
  value,
  onCommit,
  onCreate,
  createHint,
}: TxLabelQuickPickerProps) {
  const [selected, setSelected] = useState<UUID[]>(value);
  const selectedRef = useRef<UUID[]>(value);
  selectedRef.current = selected;
  // Serializes label PUTs; each toggle chains onto the previous one.
  const commitChain = useRef<Promise<unknown>>(Promise.resolve());

  // Re-seed from the server-confirmed value when its *contents* change (e.g. a
  // PUT settles, an unrelated edit invalidates the list, or the picker re-opens
  // on another row). Guarding on content — not array identity — avoids a flicker
  // that would otherwise uncheck an in-flight optimistic toggle when an unrelated
  // refetch hands back a new-but-equal array reference.
  useEffect(() => {
    const cur = selectedRef.current;
    const sameContent = value.length === cur.length && value.every((id) => cur.includes(id));
    if (!sameContent) {
      setSelected(value);
      selectedRef.current = value;
    }
  }, [value]);

  // Add `id` to the selection and commit it. Shared by a toggle-on and a create
  // so both flow through the SAME serialized chain (no separate PUT for creates).
  // Chain the PUT so it runs after any in-flight one (ordered application). On
  // failure, undo just this add relative to the latest state; the leading catch
  // keeps a prior failure from breaking the chain so later toggles still fire.
  const append = (id: UUID) => {
    const cur = selectedRef.current;
    if (cur.includes(id)) return;
    const next = [...cur, id];
    selectedRef.current = next;
    setSelected(next);
    commitChain.current = commitChain.current
      .catch(() => {})
      .then(() => onCommit(next))
      .catch(() => {
        const reverted = selectedRef.current.filter((x) => x !== id);
        selectedRef.current = reverted;
        setSelected(reverted);
      });
  };

  const toggle = (id: UUID) => {
    const cur = selectedRef.current;
    if (!cur.includes(id)) {
      append(id);
      return;
    }
    const next = cur.filter((x) => x !== id);
    selectedRef.current = next;
    setSelected(next);
    commitChain.current = commitChain.current
      .catch(() => {})
      .then(() => onCommit(next))
      .catch(() => {
        const latest = selectedRef.current;
        const reverted = latest.includes(id) ? latest : [...latest, id];
        selectedRef.current = reverted;
        setSelected(reverted);
      });
  };

  // Create-then-assign in one gesture: the returned id is appended through the
  // same serialized commit path as a toggle.
  const handleCreate = async (name: string) => {
    const id = await onCreate(name);
    if (id) append(id);
  };

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Tags className="mr-2 h-4 w-4" aria-hidden />
        Labels
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. Radix SubContent already
          prevents open-auto-focus, so MenuSearchList's mount effect takes focus. */}
      <ContextMenuSubContent className="p-0">
        <MenuSearchList
          options={options}
          isSelected={(id) => selected.includes(id)}
          onPick={toggle}
          searchAriaLabel="Search labels"
          placeholder="Search labels…"
          createHint={createHint}
          onCreate={handleCreate}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
