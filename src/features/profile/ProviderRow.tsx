import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('profile');
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
          {status.linked
            ? t('provider.linkedAs', { subtitle: status.subtitle })
            : t('provider.notLinked')}
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
          {t('provider.unlink')}
        </Button>
      ) : (
        <Button onClick={onLink}>{t('provider.link', { provider })}</Button>
      )}
      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('provider.unlinkTitle', { provider })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('provider.unlinkDescription', { provider })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {t('provider.unlink')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
