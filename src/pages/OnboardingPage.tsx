import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/BrandLogo';
import { OnboardingForm } from '@/features/onboarding/OnboardingForm';
import { useOnboardingStatus } from '@/features/onboarding/useOnboardingStatus';

// First-run screen (tracker#58). Freely visitable — an already-configured user
// who lands here just sees their current values and can leave via Get started.
export default function OnboardingPage() {
  const { t } = useTranslation('onboarding');
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
        <span className="text-xl font-semibold">HomeAccounting</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('page.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('page.intro')}</p>
          <OnboardingForm />
          <p className="text-sm text-muted-foreground">{t('page.later')}</p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={onSkip}>
              {t('page.skip')}
            </Button>
            <Button onClick={goToApp}>{t('page.getStarted')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
