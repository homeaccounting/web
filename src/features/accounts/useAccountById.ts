import type { UUID } from '@/api/types';
import { useAccounts } from './useAccounts';

export function useAccountById(id: UUID | undefined) {
  const accounts = useAccounts();
  return {
    ...accounts,
    data: id ? accounts.data?.find((a) => a.id === id) : undefined,
  };
}
