import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { reportsApi, type ReportRange } from '@/api/reports';
import { useAuth } from '@/auth/useAuth';

export function useSpendingByCategory(range: ReportRange) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['reports', 'spending', range.from ?? null, range.to ?? null],
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return reportsApi(client).spendingByCategory(range);
    },
  });
}

export function useIncomeVsExpense(range: ReportRange) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['reports', 'income-expense', range.from ?? null, range.to ?? null],
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return reportsApi(client).incomeVsExpense(range);
    },
  });
}

export function useNetWorth() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['reports', 'net-worth'], // period-independent
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return reportsApi(client).netWorth();
    },
  });
}
