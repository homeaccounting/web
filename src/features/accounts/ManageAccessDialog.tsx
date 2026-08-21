import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Badge } from '@/components/ui/badge';
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
import i18n from '@/lib/i18n';
import type { AccountResponse, AccountAccessEntry, AccountRole } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { RequiredMarker } from '@/components/RequiredMarker';
import { shareAccountSchema, type ShareAccountFormValues } from './shareAccountSchema';
import { useAccountAccess } from './useAccountAccess';
import { useShareAccount } from './useShareAccount';
import { useRevokeAccess } from './useRevokeAccess';
import { canManage, GRANTABLE_ROLES, roleLabel } from './roles';

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
  return <Badge variant="status">{roleLabel(role)}</Badge>;
}

// Maps a share-request ApiError onto the friendly copy called for by the
// share-account design spec (docs/specs/2026-07-09-share-account-design.md):
// unknown user vs. self-share get dedicated copy, everything else (e.g. an
// external-account rejection) falls back to the server's own message.
function mapShareError(e: ApiError): string {
  const haystack = `${e.code ?? ''} ${e.message}`.toLowerCase();
  if (e.status === 404 || haystack.includes('not found') || haystack.includes('no user')) {
    return i18n.t('accounts:manageDialog.noUserFound');
  }
  if (haystack.includes('self')) {
    return i18n.t('accounts:manageDialog.selfShare');
  }
  return e.message;
}

export function ManageAccessDialog({ open, onOpenChange, account }: ManageAccessDialogProps) {
  const { t } = useTranslation('accounts');
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
      setShareError(e instanceof ApiError ? mapShareError(e) : t('errors.generic'));
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
    revoke.error instanceof ApiError ? revoke.error.message : t('errors.generic');

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
            <DialogTitle>{t('manageDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('manageDialog.description', { name: account.name })}
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
                      {t('manageDialog.userId')}
                      <RequiredMarker />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t('manageDialog.userIdPlaceholder')} {...field} />
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
                      {t('manageDialog.role')}
                      <RequiredMarker />
                    </FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger aria-label={t('manageDialog.role')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRANTABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
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
                  {share.isPending ? t('manageDialog.sharing') : t('manageDialog.share')}
                </Button>
              </div>
            </form>
          </FormProvider>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('manageDialog.peopleWithAccess')}</h3>

            {access.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {access.isError && (
              <div className="space-y-2">
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t('manageDialog.loadError')}</AlertDescription>
                </Alert>
                <Button variant="outline" size="sm" onClick={() => void access.refetch()}>
                  {t('common:retry')}
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
                        aria-label={t('manageDialog.revokeAria', { label })}
                        onClick={() => setRevokeTarget(entry)}
                      >
                        {t('manageDialog.revoke')}
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
            <AlertDialogTitle>{t('manageDialog.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget &&
                t('manageDialog.revokeDescription', {
                  label: displayLabel(revokeTarget),
                  name: account.name,
                })}
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
              {t('common:cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => void confirmRevoke()}
            >
              {t('manageDialog.revoke')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
