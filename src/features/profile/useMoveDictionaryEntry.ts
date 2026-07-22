import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

interface MoveVars {
  dictId: string;
  entryId: UUID;
  // Target parent group id, or null to move the entry back to the root level.
  parentId: UUID | null;
}

export function useMoveDictionaryEntry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, MoveVars>({
    mutationFn: ({ dictId, entryId, parentId }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).moveEntry(dictId, entryId, { parentId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
