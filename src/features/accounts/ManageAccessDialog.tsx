import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ApiError } from '@/api/client';
import type { AccountResponse, AccountAccessEntry, AccountRole } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { RequiredMarker } from '@/components/RequiredMarker';
import { shareAccountSchema, type ShareAccountFormValues } from './shareAccountSchema';
import { useAccountAccess } from './useAccountAccess';
import { useShareAccount } from './useShareAccount';
import { useRevokeAccess } from './useRevokeAccess';
import { canManage, GRANTABLE_ROLES, ROLE_LABELS } from './roles';

export interface ManageAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

// Truncates a UUID for display when no email/telegram handle is available.
function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function displayLabel(entry: AccountAccessEntry): string {
  return (
    entry.email ?? (entry.telegramUsername ? `@${entry.telegramUsername}` : shortId(entry.userId))
  );
}

function RoleBadge({ role }: { role: AccountRole }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {ROLE_LABELS[role]}
    </span>
  );
}

// Maps a share-request ApiError onto the friendly copy called for by the
// share-account design spec (docs/specs/2026-07-09-share-account-design.md):
// unknown user vs. self-share get dedicated copy, everything else (e.g. an
// external-account rejection) falls back to the server's own message.
function mapShareError(e: ApiError): string {
  const haystack = `${e.code ?? ''} ${e.message}`.toLowerCase();
  if (e.status === 404 || haystack.includes('not found') || haystack.includes('no user')) {
    return 'No user found with that ID.';
  }
  if (haystack.includes('self')) {
    return "You can't share an account with yourself.";
  }
  return e.message;
}

export function ManageAccessDialog({ open, onOpenChange, account }: ManageAccessDialogProps) {
  const access = useAccountAccess(account.id, open);
  const share = useShareAccount(account.id);
  const revoke = useRevokeAccess(account.id);
  const { session } = useAuth();

  const [shareError, setShareError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AccountAccessEntry | null>(null);

  const form = useForm<ShareAccountFormValues>({
    resolver: zodResolver(shareAccountSchema),
    defaultValues: { userId: '', role: 'viewer' },
  });

  const onShareSubmit = form.handleSubmit(async (values) => {
    setShareError(null);
    try {
      await share.mutateAsync(values);
      form.reset({ userId: '', role: 'viewer' });
    } catch (e) {
      setShareError(
        e instanceof ApiError ? mapShareError(e) : 'Something went wrong. Please try again.',
      );
    }
  });

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revoke.mutateAsync(revokeTarget.userId);
      setRevokeTarget(null);
    } catch {
      // Surfaced via the inline banner below; keep the confirm dialog open.
    }
  };

  const revokeBannerMessage =
    revoke.error instanceof ApiError
      ? revoke.error.message
      : 'Something went wrong. Please try again.';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setShareError(null);
            setRevokeTarget(null);
            // Clear any stale revoke error so it can't flash on reopen — the
            // AlertDialog's Cancel/close paths reset it too; this keeps the
            // outer close symmetric with the share flow.
            revoke.reset();
          }
          onOpenChange(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>
              Share &ldquo;{account.name}&rdquo; with other people, or revoke their access.
            </DialogDescription>
          </DialogHeader>

          <FormProvider {...form}>
            <form
              onSubmit={(e) => {
                void onShareSubmit(e);
              }}
              className="space-y-4"
            >
              {shareError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{shareError}</AlertDescription>
                </Alert>
              )}
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      User ID
                      <RequiredMarker />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="00000000-0000-0000-0000-000000000000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Role
                      <RequiredMarker />
                    </FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger aria-label="Role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRANTABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={share.isPending}>
                  {share.isPending ? 'Sharing…' : 'Share'}
                </Button>
              </div>
            </form>
          </FormProvider>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">People with access</h3>

            {access.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {access.isError && (
              <div className="space-y-2">
                <Alert variant="destructive" role="alert">
                  <AlertDescription>Could not load access.</AlertDescription>
                </Alert>
                <Button variant="outline" size="sm" onClick={() => void access.refetch()}>
                  Retry
                </Button>
              </div>
            )}

            {/* No empty-state branch: the owner is always a member, so the
                access list is never empty. */}
            {!access.isLoading && !access.isError && access.data && (
              <ul className="space-y-2">
                {access.data.map((entry) => {
                  const label = displayLabel(entry);
                  const disabled = canManage(entry.role) || entry.userId === session?.userId;
                  return (
                    <li
                      key={entry.userId}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{label}</span>
                        <RoleBadge role={entry.role} />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        aria-label={`Revoke ${label}`}
                        onClick={() => setRevokeTarget(entry)}
                      >
                        Revoke
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(next) => {
          if (revoke.isPending) return;
          if (!next) {
            revoke.reset();
            setRevokeTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget &&
                `${displayLabel(revokeTarget)} will lose access to "${account.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revoke.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{revokeBannerMessage}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={revoke.isPending}
              onClick={() => {
                revoke.reset();
                setRevokeTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => void confirmRevoke()}
            >
              Revoke
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
