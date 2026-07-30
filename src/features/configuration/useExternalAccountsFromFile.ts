import { useMutation } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { bankingApi } from '@/api/banking';
import type { ExternalAccountDTO, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export interface ExternalAccountsFromFileInput {
  connId: UUID;
  format: string;
  files: File[];
}

// Discover the external accounts contained in an uploaded statement file.
// A mutation (not a query) because it needs an uploaded file as input and its
// result should never be cached — mirrors the on-demand, un-cached shape of
// `useExternalAccounts`, but keyed off a file upload.
export function useExternalAccountsFromFile() {
  const { tokenRef, signOut } = useAuth();
  return useMutation<ExternalAccountDTO[], Error, ExternalAccountsFromFileInput>({
    mutationFn: ({ connId, format, files }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return bankingApi(client).listExternalAccountsFromFile(connId, format, files);
    },
  });
}
