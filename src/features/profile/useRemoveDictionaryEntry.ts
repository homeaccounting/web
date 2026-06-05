import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

interface RemoveVars {
  dictId: string;
  entryId: UUID;
}

export function useRemoveDictionaryEntry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, RemoveVars>({
    mutationFn: ({ dictId, entryId }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).removeEntry(dictId, entryId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
