import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { ConfigurationResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useConfiguration() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['configuration'],
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).get();
    },
  });
}

// Flattens all dictionary entries into an `id -> name` lookup. Dictionary
// entry ids are globally-unique UUIDs (DictionaryEntryId), so collisions
// across dictionaries cannot occur.
export function useDictionaryEntryNames(config: ConfigurationResponse | undefined) {
  return useMemo(() => {
    const map = new Map<string, string>();
    if (!config) return map;
    for (const dict of Object.values(config.dictionaries)) {
      for (const entry of dict.entries) {
        map.set(entry.id, entry.name);
      }
    }
    return map;
  }, [config]);
}
