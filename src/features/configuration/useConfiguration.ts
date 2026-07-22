import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import { flattenDictionaryTree } from '@/api/dictionary';
import type { ConfigurationResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

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

// Flattens all dictionary entries into an `id -> full-path name` lookup (so a
// nested category resolves to e.g. "Food / Groceries"). Every node is included
// — groups as well as items — so a committed id always resolves. Dictionary
// entry ids are globally-unique UUIDs (DictionaryEntryId), so collisions across
// dictionaries cannot occur.
export function useDictionaryEntryNames(config: ConfigurationResponse | undefined) {
  return useMemo(() => {
    const map = new Map<string, string>();
    if (!config) return map;
    for (const dict of Object.values(config.dictionaries)) {
      for (const node of flattenDictionaryTree(dict)) {
        map.set(node.id, node.path);
      }
    }
    return map;
  }, [config]);
}
