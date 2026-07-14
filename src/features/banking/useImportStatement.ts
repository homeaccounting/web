import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { bankingApi } from '@/api/banking';
import type { ImportResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export interface ImportStatementInput {
  connId: UUID;
  format: string;
  file: Blob;
}

export function useImportStatement() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ImportResponse, Error, ImportStatementInput>({
    mutationFn: ({ connId, format, file }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return bankingApi(client).importStatement(connId, format, file);
    },
    onSuccess: () => {
      // A file import changes both transactions and accounts, same as a pull import.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
