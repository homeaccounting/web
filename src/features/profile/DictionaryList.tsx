import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Plus } from 'lucide-react';
import type { DictionaryResponse, EntryRole } from '@/api/types';
import { flattenDictionaryTree, type FlatDictionaryNode } from '@/api/dictionary';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAddDictionaryEntry } from './useAddDictionaryEntry';
import { useRenameDictionaryEntry } from './useRenameDictionaryEntry';
import { useRemoveDictionaryEntry } from './useRemoveDictionaryEntry';
import { useMoveDictionaryEntry } from './useMoveDictionaryEntry';
import { entryNameSchema } from './entryNameSchema';

interface Props {
  dictId: string;
  title: string;
  dict: DictionaryResponse | undefined;
  addLabel: string;
}

// The parent Select uses this sentinel for "root level" since a Radix
// SelectItem value cannot be an empty string (and the model uses null).
const ROOT = 'root';

// The display label of a node: items read as their full path ("Food /
// Groceries") so a leaf is unambiguous; groups show their own name (they are
// containers, not selectable, and always sit at the root under depth 2).
const displayOf = (node: FlatDictionaryNode) => (node.type === 'item' ? node.path : node.name);

// In-flight edit of a single row: the working name/parent plus the originals,
// so commit only fires the rename/move that actually changed.
interface EditState {
  id: string;
  name: string;
  parentId: string;
  isItem: boolean;
  origName: string;
  origParent: string;
}

export function DictionaryList({ dictId, title, dict, addLabel }: Props) {
  const { t } = useTranslation('profile');
  const add = useAddDictionaryEntry();
  const rename = useRenameDictionaryEntry();
  const remove = useRemoveDictionaryEntry();
  const move = useMoveDictionaryEntry();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [adding, setAdding] = useState<{ name: string; type: EntryRole; parentId: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<FlatDictionaryNode | null>(null);
  const opError = add.error ?? rename.error ?? remove.error ?? move.error;

  const nodes = flattenDictionaryTree(dict);
  const groups = nodes.filter((n) => n.type === 'group');

  const submitAdd = () => {
    if (!adding) return;
    const parsed = entryNameSchema.safeParse({ name: adding.name });
    if (!parsed.success) {
      setAdding(null);
      return;
    }
    // Groups always live at the root under depth 2; items may nest under a group.
    const parentId = adding.type === 'group' || adding.parentId === ROOT ? null : adding.parentId;
    add.mutate(
      { dictId, name: parsed.data.name, type: adding.type, parentId },
      { onSuccess: () => setAdding(null) },
    );
  };

  // Commit an edit and close the row. Takes the target state explicitly so a
  // control that both mutates state and commits (the parent Select) works off
  // the new value rather than the not-yet-applied React state.
  const commitEdit = (state: EditState) => {
    const parsed = entryNameSchema.safeParse({ name: state.name });
    if (!parsed.success) {
      setEditing(null);
      return;
    }
    if (parsed.data.name !== state.origName) {
      rename.mutate({ dictId, entryId: state.id, name: parsed.data.name });
    }
    // Only items are movable (groups are pinned to the root under depth 2).
    if (state.isItem && state.parentId !== state.origParent) {
      move.mutate({
        dictId,
        entryId: state.id,
        parentId: state.parentId === ROOT ? null : state.parentId,
      });
    }
    setEditing(null);
  };

  return (
    <section className="space-y-2" aria-labelledby={`${dictId}-heading`}>
      <h3 id={`${dictId}-heading`} className="text-sm font-semibold">
        {title}
      </h3>
      {nodes.length === 0 && <EmptyState message={t('dictionaries.empty')} className="p-0" />}
      <ul className="divide-y">
        {nodes.map((node) => {
          const display = displayOf(node);
          const indent = { paddingLeft: `${node.depth * 1}rem` };
          return editing?.id === node.id ? (
            <li key={node.id} className="flex items-center gap-2 py-2" style={indent}>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- inline edit replaces the row in place; focus must follow the click
                autoFocus
                value={editing.name}
                onChange={(ev) => setEditing({ ...editing, name: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') commitEdit(editing);
                  if (ev.key === 'Escape') setEditing(null);
                }}
                aria-label={t('dictionaries.rename', { name: display })}
                className="h-9 text-sm"
              />
              {editing.isItem && (
                <Select
                  value={editing.parentId}
                  // Picking a group applies the move (and any pending rename) and
                  // closes the row immediately — commit off the new value since
                  // setEditing has not applied yet.
                  onValueChange={(value) => commitEdit({ ...editing, parentId: value })}
                >
                  <SelectTrigger
                    className="h-9 w-auto"
                    aria-label={t('dictionaries.move', { name: display })}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Escape') setEditing(null);
                    }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>{t('dictionaries.topLevel')}</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          ) : (
            <li key={node.id} className="flex items-center justify-between py-2" style={indent}>
              <span className="flex items-center gap-2">
                <span>{display}</span>
                {node.type === 'group' && (
                  <span className="text-xs text-muted-foreground">
                    {t('dictionaries.groupBadge')}
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('dictionaries.rename', { name: display })}
                  onClick={() =>
                    setEditing({
                      id: node.id,
                      name: node.name,
                      parentId: node.parentId ?? ROOT,
                      isItem: node.type === 'item',
                      origName: node.name,
                      origParent: node.parentId ?? ROOT,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('dictionaries.delete', { name: display })}
                  onClick={() => setDeleting(node)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- inline add replaces the trigger button; focus must follow the click
            autoFocus
            value={adding.name}
            onChange={(ev) => setAdding({ ...adding, name: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') submitAdd();
              if (ev.key === 'Escape') setAdding(null);
            }}
            placeholder={addLabel}
            aria-label={addLabel}
            className="h-9 max-w-xs text-sm"
          />
          <Select
            value={adding.type}
            onValueChange={(value) => setAdding({ ...adding, type: value as EntryRole })}
          >
            <SelectTrigger className="h-9 w-auto" aria-label={t('dictionaries.entryType')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="item">{t('dictionaries.item')}</SelectItem>
              <SelectItem value="group">{t('dictionaries.group')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={adding.type === 'group' ? ROOT : adding.parentId}
            disabled={adding.type === 'group'}
            onValueChange={(value) => setAdding({ ...adding, parentId: value })}
          >
            <SelectTrigger className="h-9 w-auto" aria-label={t('dictionaries.parentGroup')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT}>{t('dictionaries.topLevel')}</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding({ name: '', type: 'item', parentId: ROOT })}
        >
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      )}
      {opError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{opError.message}</AlertDescription>
        </Alert>
      )}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dictionaries.deleteTitle', { name: deleting ? displayOf(deleting) : '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('dictionaries.deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) {
                  remove.mutate({ dictId, entryId: deleting.id });
                }
                setDeleting(null);
              }}
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
