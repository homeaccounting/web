import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authApi } from '@/api/auth';
import { usersApi } from '@/api/users';
import type { ApiClient } from '@/api/client';

interface LinkTelegramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ApiClient;
}

type Phase = 'linked' | 'error' | 'requesting' | 'showing';

export function LinkTelegramDialog({ open, onOpenChange, client }: LinkTelegramDialogProps) {
  const queryClient = useQueryClient();
  const popupFiredRef = useRef(false);
  const { data: profile } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi(client).getMe(),
  });
  const mutation = useMutation({
    mutationFn: () => authApi(client).requestTelegramLinkCode(),
  });

  useEffect(() => {
    if (open) {
      popupFiredRef.current = false;
      mutation.reset();
      mutation.mutate();
    }
    // The mutation handle is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (mutation.isSuccess && mutation.data && !popupFiredRef.current) {
      popupFiredRef.current = true;
      window.open(mutation.data.deepLink, '_blank', 'noopener,noreferrer');
    }
  }, [mutation.isSuccess, mutation.data]);

  const phase: Phase =
    profile?.telegramIdentity != null
      ? 'linked'
      : mutation.isError
        ? 'error'
        : mutation.isPending || !mutation.data
          ? 'requesting'
          : 'showing';

  useEffect(() => {
    if (phase !== 'linked' || !open) return;
    const id = setTimeout(() => onOpenChange(false), 1500);
    return () => clearTimeout(id);
  }, [phase, open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Link Telegram</DialogTitle>
        </DialogHeader>
        {phase === 'linked' && profile?.telegramIdentity && (
          <p className="text-sm">
            Telegram linked as @
            {profile.telegramIdentity.username ?? profile.telegramIdentity.firstName}
          </p>
        )}
        {phase === 'requesting' && (
          <p className="text-sm text-muted-foreground">Generating link…</p>
        )}
        {phase === 'error' && mutation.error && (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
            <Button onClick={() => mutation.mutate()}>Retry</Button>
          </div>
        )}
        {phase === 'showing' && mutation.data && (
          <div className="flex flex-col gap-3">
            <Button asChild>
              <a href={mutation.data.deepLink} target="_blank" rel="noopener noreferrer">
                Open Telegram
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">
              Link expires at{' '}
              {new Date(mutation.data.expiresAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
              }}
            >
              I&apos;ve linked it
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
