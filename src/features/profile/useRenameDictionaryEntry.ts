import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

interface RenameVars {
  dictId: string;
  entryId: UUID;
  name: string;
}

export function useRenameDictionaryEntry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, RenameVars>({
    mutationFn: ({ dictId, entryId, name }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).renameEntry(dictId, entryId, { name });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
