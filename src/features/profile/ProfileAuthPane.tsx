import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClient, ApiError, baseUrl } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/useAuth';
import { beginLinkFlow, saveOAuthState } from '@/auth/oauthFlow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { LinkTelegramDialog } from '@/components/LinkTelegramDialog';
import { useUserProfile } from './useUserProfile';
import { useChangePassword } from './useChangePassword';
import { useUnlinkOAuth } from './useUnlinkOAuth';
import { useUnlinkTelegram } from './useUnlinkTelegram';
import { ProviderRow } from './ProviderRow';
import { passwordSchema, type PasswordFormValues } from './passwordSchema';

export function ProfileAuthPane() {
  const profile = useUserProfile();
  const { tokenRef, signOut } = useAuth();
  const changePassword = useChangePassword();
  const unlinkOAuth = useUnlinkOAuth();
  const unlinkTelegram = useUnlinkTelegram();
  const [tgDialogOpen, setTgDialogOpen] = useState(false);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      }),
    [tokenRef, signOut],
  );

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onChange',
  });

  if (profile.isPending) {
    return <Skeleton className="h-32" />;
  }
  if (profile.isError || !profile.data) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>Failed to load profile.</AlertDescription>
      </Alert>
    );
  }
  const p = profile.data;
  const google = p.oauthIdentities.find((i) => i.provider === 'Google') ?? null;
  const tg = p.telegramIdentity;

  const credentialCount = (p.hasPassword ? 1 : 0) + p.oauthIdentities.length + (tg ? 1 : 0);
  const disableUnlinkReason =
    credentialCount <= 1 ? 'You need at least one way to sign in.' : undefined;

  const onLinkGoogle = async () => {
    const { redirectUrl, state } = await authApi(client).initiateOAuth('google');
    saveOAuthState(state);
    beginLinkFlow({ returnTo: '/profile/auth' });
    window.location.href = redirectUrl;
  };

  const submitPassword = (values: PasswordFormValues) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => form.reset(),
        onError: (err) => {
          if (err instanceof ApiError && err.fieldErrors) {
            for (const [field, message] of Object.entries(err.fieldErrors)) {
              if (field === 'currentPassword' || field === 'newPassword') {
                form.setError(field, { message });
              }
            }
          }
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          {p.hasPassword ? (
            <form className="space-y-3" onSubmit={(e) => void form.handleSubmit(submitPassword)(e)}>
              <Input
                type="password"
                placeholder="Current password"
                {...form.register('currentPassword')}
                aria-label="Current password"
              />
              {form.formState.errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.currentPassword.message}
                </p>
              )}
              <Input
                type="password"
                placeholder="New password"
                {...form.register('newPassword')}
                aria-label="New password"
              />
              {form.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
              <Input
                type="password"
                placeholder="Confirm new password"
                {...form.register('confirmPassword')}
                aria-label="Confirm new password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
              {changePassword.error instanceof ApiError && !changePassword.error.fieldErrors && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{changePassword.error.message}</AlertDescription>
                </Alert>
              )}
              {changePassword.isSuccess && (
                <p data-testid="password-status" className="text-sm text-green-600">
                  Password changed.
                </p>
              )}
              <Button type="submit" disabled={!form.formState.isDirty || changePassword.isPending}>
                Change password
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your account uses OAuth sign-in. Setting an initial password isn&rsquo;t available
              yet.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Linked accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderRow
            provider="Google"
            status={google ? { linked: true, subtitle: google.subject } : { linked: false }}
            onLink={() => void onLinkGoogle()}
            onUnlink={() => unlinkOAuth.mutateAsync('Google')}
            disableUnlinkReason={google ? disableUnlinkReason : undefined}
          />
          <ProviderRow
            provider="Telegram"
            status={
              tg
                ? { linked: true, subtitle: tg.username ? `@${tg.username}` : tg.firstName }
                : { linked: false }
            }
            onLink={() => setTgDialogOpen(true)}
            onUnlink={() => unlinkTelegram.mutateAsync()}
            disableUnlinkReason={tg ? disableUnlinkReason : undefined}
          />
        </CardContent>
      </Card>
      <LinkTelegramDialog open={tgDialogOpen} onOpenChange={setTgDialogOpen} client={client} />
    </div>
  );
}
