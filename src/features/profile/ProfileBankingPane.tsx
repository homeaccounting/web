import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { BankConnectionDTO } from '@/api/types';
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useUpdateConnection } from '@/features/configuration/useUpdateConnection';
import { useRemoveConnection } from '@/features/configuration/useRemoveConnection';
import { useProviders } from '@/features/banking/useProviders';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/EmptyState';
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
  const { data: providers } = useProviders();
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const mappedCount = Object.keys(connection.accountMap).length;
  const opError = update.error ?? remove.error;
  // "Link accounts" maps external accounts to local ones. Pull providers list
  // them live via GET .../external-accounts; file providers discover them from
  // an uploaded statement inside the dialog. Offer it for either transport;
  // fail-closed like SyncNowButton / ImportStatementButton (hidden until
  // providers resolve).
  const provider = providers?.find((p) => p.id === connection.provider);
  const supportsPull = provider?.supportsPull ?? false;
  const supportsFile = provider?.supportsFile ?? false;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{connection.name}</span>
        <Badge variant="muted">{connection.provider}</Badge>
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
          {(supportsPull || supportsFile) && (
            <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
              Link accounts
            </Button>
          )}
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
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return (
      <div className="space-y-2">
        <Alert variant="destructive" role="alert">
          <AlertDescription>Couldn&rsquo;t load bank connections.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void config.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const c = config.data;
  const expenseCategories = flattenDictionary(c.dictionaries['expense']);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bank connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.banking.connections.length === 0 ? (
            <EmptyState message="No connections yet." className="p-0" />
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
