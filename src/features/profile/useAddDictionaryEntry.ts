import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { AddEntryResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

interface AddVars {
  dictId: string;
  name: string;
}

export function useAddDictionaryEntry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<AddEntryResponse, Error, AddVars>({
    mutationFn: ({ dictId, name }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).addEntry(dictId, { name });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
