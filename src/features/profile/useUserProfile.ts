import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { usersApi } from '@/api/users';
import { useAuth } from '@/auth/useAuth';

export function useUserProfile() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['users', 'me'],
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return usersApi(client).getMe();
    },
  });
}
