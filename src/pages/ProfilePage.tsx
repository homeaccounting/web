import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileGeneralPane } from '@/features/profile/ProfileGeneralPane';
import { ProfileDictionariesPane } from '@/features/profile/ProfileDictionariesPane';
import { ProfileAuthPane } from '@/features/profile/ProfileAuthPane';

const TABS = ['general', 'dictionaries', 'auth'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab);
}

export default function ProfilePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const active: Tab | undefined = isTab(tab) ? tab : tab === undefined ? 'general' : undefined;

  if (active === undefined) {
    return <Navigate to="/profile/general" replace />;
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <h1 className="mb-6 text-xl font-semibold">Profile</h1>
        <Tabs value={active} onValueChange={(next) => navigate(`/profile/${next}`)}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="dictionaries">Dictionaries</TabsTrigger>
            <TabsTrigger value="auth">Auth</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <ProfileGeneralPane />
          </TabsContent>
          <TabsContent value="dictionaries">
            <ProfileDictionariesPane />
          </TabsContent>
          <TabsContent value="auth">
            <ProfileAuthPane />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
