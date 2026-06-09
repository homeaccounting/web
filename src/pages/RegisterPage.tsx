import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
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
      setServerError(err instanceof ApiError ? err.message : 'Registration failed');
    }
  };

  const onGoogle = async () => {
    setServerError(null);
    try {
      const { redirectUrl, state } = await authApi(client).initiateOAuth('google');
      saveOAuthState(state);
      window.location.href = redirectUrl;
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Google sign-up failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {serverError && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              Create account
            </Button>
          </form>
          <Separator />
          <Button variant="outline" className="w-full" onClick={() => void onGoogle()}>
            Sign up with Google
          </Button>
          <p className="text-sm text-muted-foreground">
            Already registered?{' '}
            <Link className="underline" to="/login">
              Sign in
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
