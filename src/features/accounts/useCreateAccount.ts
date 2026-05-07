import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { AccountResponse, CreateAccountRequest } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useCreateAccount() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<AccountResponse, Error, CreateAccountRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).create(body);
    },
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.setQueryData<AccountResponse[] | undefined>(['accounts'], (prev) =>
        prev ? [...prev, account] : [account],
      );
    },
  });
}
