import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { BankConnectionDTO } from '@/api/types';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useUpdateConnection } from '@/features/configuration/useUpdateConnection';
import { useRemoveConnection } from '@/features/configuration/useRemoveConnection';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import { BankConnectionDialog } from './BankConnectionDialog';
import { LinkAccountsDialog } from './LinkAccountsDialog';
import { MccMappingEditor } from './MccMappingEditor';

function ConnectionRow({ connection }: { connection: BankConnectionDTO }) {
  const update = useUpdateConnection();
  const remove = useRemoveConnection();
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const mappedCount = Object.keys(connection.accountMap).length;
  const opError = update.error ?? remove.error;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{connection.name}</span>
        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {connection.provider}
        </span>
        <span className="text-sm text-muted-foreground">•••• {connection.tokenHint}</span>
        <span className="text-sm text-muted-foreground">{mappedCount} mapped</span>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            checked={connection.enabled}
            disabled={update.isPending}
            onCheckedChange={(next) =>
              update.mutate({ id: connection.id, body: { enabled: next } })
            }
            aria-label={`Enable ${connection.name}`}
          />
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            Link accounts
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
            Remove
          </Button>
        </div>
      </div>
      {opError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{opError.message}</AlertDescription>
        </Alert>
      )}
      <BankConnectionDialog open={editOpen} onOpenChange={setEditOpen} connection={connection} />
      <LinkAccountsDialog open={linkOpen} onOpenChange={setLinkOpen} connection={connection} />
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {connection.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the bank connection. Imported transactions are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                remove.mutate(connection.id);
                setConfirmRemove(false);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function ProfileBankingPane() {
  const config = useConfiguration();
  const [addOpen, setAddOpen] = useState(false);

  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>Failed to load configuration.</AlertDescription>
      </Alert>
    );
  }

  const c = config.data;
  const expenseCategories = c.dictionaries['expense-category']?.entries ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bank connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.banking.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections yet</p>
          ) : (
            <ul className="divide-y">
              {c.banking.connections.map((conn) => (
                <ConnectionRow key={conn.id} connection={conn} />
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add connection
          </Button>
          <BankConnectionDialog open={addOpen} onOpenChange={setAddOpen} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCC → category mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <MccMappingEditor
            value={c.banking.mccExpenseCategoryMap}
            expenseCategories={expenseCategories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
