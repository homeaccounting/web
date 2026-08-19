import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import { useAuth } from '@/auth/useAuth';

export function useLocalizationOptions() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['localization-options'],
    enabled: !!session,
    staleTime: Infinity,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).getLocalizationOptions();
    },
  });
}
