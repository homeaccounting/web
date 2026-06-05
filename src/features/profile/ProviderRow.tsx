import { useState } from 'react';
import { Button } from '@/components/ui/button';
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

export type ProviderName = 'Google' | 'Telegram';

export type ProviderStatus = { linked: false } | { linked: true; subtitle: string };

interface Props {
  provider: ProviderName;
  status: ProviderStatus;
  onLink: () => void;
  onUnlink: () => Promise<void>;
  disableUnlinkReason?: string;
}

export function ProviderRow({ provider, status, onLink, onUnlink, disableUnlinkReason }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onUnlink();
      setConfirming(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{provider}</p>
        <p className="text-sm text-muted-foreground">
          {status.linked ? `Linked as ${status.subtitle}` : 'Not linked'}
        </p>
      </div>
      {status.linked ? (
        <Button
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={!!disableUnlinkReason}
          title={disableUnlinkReason}
          aria-disabled={!!disableUnlinkReason}
        >
          Unlink
        </Button>
      ) : (
        <Button onClick={onLink}>Link {provider}</Button>
      )}
      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {provider}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won&rsquo;t be able to sign in with {provider} until you link it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
