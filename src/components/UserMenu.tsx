import { useQuery } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ApiClient } from '@/api/client';
import { authApi } from '@/api/auth';
import { usersApi } from '@/api/users';
import { useAuth } from '@/auth/useAuth';
import { beginLinkFlow, saveOAuthState } from '@/auth/oauthFlow';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function UserMenu() {
  const { session, signOut, tokenRef } = useAuth();
  const client = new ApiClient({
    baseUrl,
    getToken: () => tokenRef.current,
    onUnauthorized: signOut,
  });
  const { data: profile } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi(client).getMe(),
    enabled: !!session,
  });

  const hasGoogle = profile?.oauthIdentities.some((i) => i.provider === 'Google') ?? false;
  const initials = (profile?.email ?? session?.email ?? '?').slice(0, 1).toUpperCase();

  const onLinkGoogle = async () => {
    const { redirectUrl, state } = await authApi(client).initiateOAuth('google');
    saveOAuthState(state);
    beginLinkFlow();
    window.location.href = redirectUrl;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label="Open user menu" className="rounded-full p-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{profile?.email ?? session?.email ?? 'Account'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!hasGoogle && (
          <DropdownMenuItem onSelect={() => void onLinkGoogle()}>Link Google</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
