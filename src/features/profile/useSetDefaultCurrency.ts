import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { ChangeCurrencyRequest } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useSetDefaultCurrency() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, ChangeCurrencyRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).setDefaultCurrency(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
