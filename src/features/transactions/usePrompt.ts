import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { promptApi } from '@/api/prompt';
import type { PromptRequest, PromptResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

// Mirrors useCreateExpense's construction. Invalidates the open account's
// transaction window + the accounts list (balances change) whenever at least
// one transaction was recorded — partial successes return 200 too, so this
// covers them; a total failure invalidates nothing.
export function usePrompt() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<PromptResponse, Error, PromptRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return promptApi(client).submit(body);
    },
    onSuccess: (data, body) => {
      if (data.succeeded.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ['transactions', body.account] });
        void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      }
    },
  });
}
