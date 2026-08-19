import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/BrandLogo';
import { OnboardingForm } from '@/features/onboarding/OnboardingForm';
import { useOnboardingStatus } from '@/features/onboarding/useOnboardingStatus';

// First-run screen (tracker#58). Freely visitable — an already-configured user
// who lands here just sees their current values and can leave via Get started.
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { skip } = useOnboardingStatus();

  const goToApp = () => navigate('/transactions', { replace: true });
  const onSkip = () => {
    skip();
    goToApp();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2">
        <BrandLogo className="h-16" />
        <span className="text-xl font-semibold">Home Accounting</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Let&rsquo;s set up the basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Pick your country and we&rsquo;ll set sensible currency and language defaults. Adjust
            anything below.
          </p>
          <OnboardingForm />
          <p className="text-sm text-muted-foreground">
            You can change any of this later in Settings.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
            <Button onClick={goToApp}>Get started</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
