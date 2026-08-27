import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ApiClient, ApiError, baseUrl } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/auth/useAuth';
import { saveOAuthState } from '@/auth/oauthFlow';
import { BrandLogo } from '@/components/BrandLogo';

const schema = z.object({
  email: z.string().email('pages:validation.emailInvalid'),
  password: z.string().min(1, 'pages:validation.passwordRequired'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useTranslation('pages');
  const { signIn, tokenRef } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const client = new ApiClient({
    baseUrl,
    getToken: () => tokenRef.current,
    onUnauthorized: (): void => {},
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const auth = await authApi(client).login(values);
      signIn(auth);
      navigate(params.get('redirectTo') ?? '/', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('login.failed'));
    }
  };

  const onGoogle = async () => {
    setServerError(null);
    try {
      const { redirectUrl, state } = await authApi(client).initiateOAuth('google');
      saveOAuthState(state);
      window.location.href = redirectUrl;
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('login.googleFailed'));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <BrandLogo className="h-24" />
        <span className="text-2xl font-semibold">HomeAccounting</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('login.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {serverError && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.email.message ?? '')}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.password.message ?? '')}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t('login.submit')}
            </Button>
          </form>
          <Separator />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              void onGoogle();
            }}
          >
            {t('login.google')}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t('login.newHere')}{' '}
            <Link className="underline" to="/register">
              {t('login.createAccount')}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
