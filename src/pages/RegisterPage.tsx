import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
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
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';

const schema = z.object({
  email: z.string().email('pages:validation.emailInvalid'),
  password: z.string().min(8, 'pages:validation.passwordMinLength'),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { t } = useTranslation('pages');
  const { signIn, tokenRef } = useAuth();
  const navigate = useNavigate();
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
      const auth = await authApi(client).register(values);
      signIn(auth);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('register.failed'));
    }
  };

  const onGoogle = async () => {
    setServerError(null);
    try {
      const { redirectUrl, state } = await authApi(client).initiateOAuth('google');
      saveOAuthState(state);
      window.location.href = redirectUrl;
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('register.googleFailed'));
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
          <CardTitle>{t('register.title')}</CardTitle>
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
                autoComplete="new-password"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.password.message ?? '')}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t('register.submit')}
            </Button>
          </form>
          <Separator />
          <Button variant="outline" className="w-full" onClick={() => void onGoogle()}>
            {t('register.google')}
          </Button>
          {/*
            Below both paths rather than inside the form: signing up with
            Google is the same agreement, and a notice attached only to the
            email form would not cover it (tracker#10).
          */}
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="register.consent"
              components={{
                // The link text comes from the translation, which replaces
                // these children. They are here so the anchors are not empty
                // in source, which is what jsx-a11y/anchor-has-content checks.
                terms: (
                  <a className="underline" href={TERMS_URL} target="_blank" rel="noreferrer">
                    Terms of Service
                  </a>
                ),
                privacy: (
                  <a className="underline" href={PRIVACY_URL} target="_blank" rel="noreferrer">
                    Privacy Notice
                  </a>
                ),
              }}
            />
          </p>
          <p className="text-sm text-muted-foreground">
            {t('register.alreadyRegistered')}{' '}
            <Link className="underline" to="/login">
              {t('register.signIn')}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
