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
  // Outstanding local commits. Incremented when a toggle enqueues a PUT and
  // decremented when that PUT drains. The re-seed effect below consults this to
  // tell the user's own in-flight edits (must NOT be re-seeded away) apart from
  // genuine external updates (must be re-seeded).
  const pendingRef = useRef(0);

  // Re-seed from the server-confirmed value when its *contents* change (e.g. a
  // PUT settles, an unrelated edit invalidates the list, or the picker re-opens
  // on another row). Guarding on content — not array identity — avoids a flicker
  // that would otherwise uncheck an in-flight optimistic toggle when an unrelated
  // refetch hands back a new-but-equal array reference.
  //
  // Skip re-seeding while local commits are outstanding: mid-sequence a settled
  // PUT flips the live cache row to an intermediate set, and re-seeding from it
  // would erase later toggles still in flight (e.g. a 3-toggle T→W→X sequence
  // where PUT#1=[T] settles before X is clicked would otherwise drop W). Re-seed
  // is for reconciling OTHER clients' changes, not the user's own pending edits;
  // once the chain drains, the final settled value re-seeds normally.
  useEffect(() => {
    if (pendingRef.current > 0) return;
    const cur = selectedRef.current;
    const sameContent = value.length === cur.length && value.every((id) => cur.includes(id));
    if (!sameContent) {
      setSelected(value);
      selectedRef.current = value;
    }
  }, [value]);

  // Enqueue a full-array PUT for `next` onto the serialized chain, tracking it in
  // `pendingRef` for its whole lifetime. The leading catch keeps a prior failure
  // from breaking the chain so later toggles still fire; `revert` undoes just
  // this change relative to the LATEST state on failure; the finally decrements
  // pending whether the PUT succeeded or failed. Increment/decrement are paired
  // here so no call path can leak a pending count.
  const enqueueCommit = (next: UUID[], revert: (latest: UUID[]) => UUID[]) => {
    selectedRef.current = next;
    setSelected(next);
    pendingRef.current += 1;
    commitChain.current = commitChain.current
      .catch(() => {})
      .then(() => onCommit(next))
      .catch(() => {
        const reverted = revert(selectedRef.current);
        selectedRef.current = reverted;
        setSelected(reverted);
      })
      .finally(() => {
        pendingRef.current -= 1;
      });
  };

  // Add `id` to the selection and commit it. Shared by a toggle-on and a create
  // so both flow through the SAME serialized chain (no separate PUT for creates).
  const append = (id: UUID) => {
    const cur = selectedRef.current;
    if (cur.includes(id)) return;
    enqueueCommit([...cur, id], (latest) => latest.filter((x) => x !== id));
  };

  const toggle = (id: UUID) => {
    const cur = selectedRef.current;
    if (!cur.includes(id)) {
      append(id);
      return;
    }
    enqueueCommit(
      cur.filter((x) => x !== id),
      (latest) => (latest.includes(id) ? latest : [...latest, id]),
    );
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
