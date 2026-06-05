import { useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import type { DictionaryEntryResponse } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { entryNameSchema } from './entryNameSchema';

interface Props {
  dictId: string;
  title: string;
  entries: DictionaryEntryResponse[];
  addLabel: string;
}

export function DictionaryList({ dictId, title, entries, addLabel }: Props) {
  const add = useAddDictionaryEntry();
  const rename = useRenameDictionaryEntry();
  const remove = useRemoveDictionaryEntry();
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ value: string } | null>(null);
  const [deleting, setDeleting] = useState<DictionaryEntryResponse | null>(null);
  const opError = add.error ?? rename.error ?? remove.error;

  const submitAdd = () => {
    if (!adding) return;
    const parsed = entryNameSchema.safeParse({ name: adding.value });
    if (!parsed.success) {
      setAdding(null);
      return;
    }
    add.mutate({ dictId, name: parsed.data.name }, { onSuccess: () => setAdding(null) });
  };

  const submitRename = () => {
    if (!editing) return;
    const parsed = entryNameSchema.safeParse({ name: editing.value });
    if (!parsed.success) {
      setEditing(null);
      return;
    }
    rename.mutate(
      { dictId, entryId: editing.id, name: parsed.data.name },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <section className="space-y-2" aria-labelledby={`${dictId}-heading`}>
      <h3 id={`${dictId}-heading`} className="text-sm font-semibold">
        {title}
      </h3>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">No entries yet</p>}
      <ul className="divide-y">
        {entries.map((e) =>
          editing?.id === e.id ? (
            <li key={e.id} className="flex items-center gap-2 py-2">
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- inline edit replaces the row in place; focus must follow the click
                autoFocus
                value={editing.value}
                onChange={(ev) => setEditing({ id: e.id, value: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') submitRename();
                  if (ev.key === 'Escape') setEditing(null);
                }}
                aria-label={`Rename ${e.name}`}
              />
            </li>
          ) : (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span>{e.name}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename ${e.name}`}
                  onClick={() => setEditing({ id: e.id, value: e.name })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${e.name}`}
                  onClick={() => setDeleting(e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
      {adding ? (
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- inline add replaces the trigger button; focus must follow the click
          autoFocus
          value={adding.value}
          onChange={(ev) => setAdding({ value: ev.target.value })}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') submitAdd();
            if (ev.key === 'Escape') setAdding(null);
          }}
          placeholder={addLabel}
          aria-label={addLabel}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding({ value: '' })}>
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
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Transactions tagged with it will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) {
                  remove.mutate({ dictId, entryId: deleting.id });
                }
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
