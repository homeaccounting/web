import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import { useAuth } from '@/auth/useAuth';

export function useProviders() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['providers'],
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).listProviders();
    },
  });
}
