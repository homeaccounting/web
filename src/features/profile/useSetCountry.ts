import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { ChangeCountryRequest, ConfigurationResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { toast } from '@/lib/toast';

// Changing the country can shift derived defaults (default/base currency,
// language) to match a country preset. After the change lands we refetch the
// configuration and, if any of those derived values changed, surface a toast so
// the user knows their setup was adjusted on their behalf.
export function useSetCountry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, ChangeCountryRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).setCountry(body);
    },
    onSuccess: async () => {
      // The cache still holds the pre-change config until the refetch resolves.
      const prev = queryClient.getQueryData<ConfigurationResponse>(['configuration']);
      // Refetch BOTH config and providers:
      // - config: the preset may have shifted default/base currency or language;
      // - providers: each provider's `inUserCountry` annotation is computed
      //   server-side from the user's country, so the list must be refetched or
      //   the connect/bank-name pickers keep showing the old country grouping.
      // refetchQueries (not invalidateQueries): invalidate only refetches ACTIVE
      // observers, so from a screen without a mounted observer the config diff
      // would see next===prev (wrongly suppressing the toast) and the providers
      // cache would stay stale until a reload; refetch always runs.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['configuration'] }),
        queryClient.refetchQueries({ queryKey: ['providers'] }),
      ]);
      const next = queryClient.getQueryData<ConfigurationResponse>(['configuration']);
      if (prev && next) {
        const changes: string[] = [];
        if (next.defaultCurrency !== prev.defaultCurrency) {
          changes.push(`default currency to ${next.defaultCurrency}`);
        }
        if (next.baseCurrency !== prev.baseCurrency) {
          changes.push(`base currency to ${next.baseCurrency}`);
        }
        if (next.language !== prev.language) {
          changes.push(`language to ${next.language}`);
        }
        if (changes.length > 0) {
          toast.success(`Updated ${changes.join(', ')} to match your country.`);
        }
      }
    },
  });
}
