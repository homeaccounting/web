import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { ProfileGeneralPane } from '@/features/profile/ProfileGeneralPane';
import { ProfileDictionariesPane } from '@/features/profile/ProfileDictionariesPane';
import { ProfileDefaultsPane } from '@/features/profile/ProfileDefaultsPane';
import { ProfileAuthPane } from '@/features/profile/ProfileAuthPane';
import { ProfileBankingPane } from '@/features/profile/ProfileBankingPane';

const STATIC_TABS = ['general', 'dictionaries', 'defaults', 'auth'] as const;
type StaticTab = (typeof STATIC_TABS)[number];
type Tab = StaticTab | 'banking';

function isStaticTab(value: string | undefined): value is StaticTab {
  return STATIC_TABS.includes(value as StaticTab);
}

export default function ProfilePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const config = useConfiguration();
  const bankingEnabled = config.data?.bankingFeatureEnabled ?? false;

  // No tab in the URL → land on General.
  if (tab === undefined) {
    return <Navigate to="/profile/general" replace />;
  }

  // Static tabs are always valid and never depend on configuration.
  const staticActive: StaticTab | undefined = isStaticTab(tab) ? tab : undefined;

  // The `banking` tab's validity depends on the (async) feature flag. Redirect
  // only once configuration has settled, so a deep-link to /profile/banking
  // doesn't flicker to /profile/general before the flag is known.
  if (staticActive === undefined) {
    if (tab === 'banking') {
      if (config.isPending) {
        return (
          <div className="flex h-screen flex-col">
            <Header />
            <main className="flex-1 overflow-y-auto">
              <PageContainer>
                <Skeleton className="h-64" />
              </PageContainer>
            </main>
          </div>
        );
      }
      if (!bankingEnabled) {
        return <Navigate to="/profile/general" replace />;
      }
    } else {
      // Genuinely-unknown tab.
      return <Navigate to="/profile/general" replace />;
    }
  }

  const active: Tab = staticActive ?? 'banking';

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <PageContainer>
          <PageHeader title="Profile" />
          <Tabs value={active} onValueChange={(next) => navigate(`/profile/${next}`)}>
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="dictionaries">Dictionaries</TabsTrigger>
              <TabsTrigger value="defaults">Defaults</TabsTrigger>
              <TabsTrigger value="auth">Auth</TabsTrigger>
              {bankingEnabled && <TabsTrigger value="banking">Banking</TabsTrigger>}
            </TabsList>
            <TabsContent value="general">
              <ProfileGeneralPane />
            </TabsContent>
            <TabsContent value="dictionaries">
              <ProfileDictionariesPane />
            </TabsContent>
            <TabsContent value="defaults">
              <ProfileDefaultsPane />
            </TabsContent>
            <TabsContent value="auth">
              <ProfileAuthPane />
            </TabsContent>
            {bankingEnabled && (
              <TabsContent value="banking">
                <ProfileBankingPane />
              </TabsContent>
            )}
          </Tabs>
        </PageContainer>
      </main>
    </div>
  );
}
