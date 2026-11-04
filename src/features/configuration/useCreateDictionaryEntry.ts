import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import { resolveEntryPath } from '@/api/dictionary';
import type { AddEntryResponse, DictionaryResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { useConfiguration } from './useConfiguration';

interface CreateVars {
  dictId: string;
  // May be a full path ("Group1 / Item1"). When `dict` is supplied and the
  // leading segment(s) match an existing group, the item is nested under it;
  // otherwise it is created at the root with the name as typed (resolveEntryPath).
  name: string;
  // The current tree for `dictId`, enabling full-path group nesting. Omit for
  // root-only creation (the previous behaviour).
  dict?: DictionaryResponse;
}

// Generic create for a dictionary ITEM in any dictionary (contact, label, …).
// Fixes type: 'item'. The parent is derived from the typed name via
// resolveEntryPath: a full path whose group prefix already exists nests the
// item under that group; anything else creates it at the root. Invalidates
// ['configuration'] so the new entry shows up everywhere it is referenced.
export function useCreateDictionaryEntry() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<AddEntryResponse, Error, CreateVars>({
    mutationFn: ({ dictId, name, dict }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const { name: leaf, parentId } = resolveEntryPath(dict, name);
      return configurationApi(client).addEntry(dictId, { name: leaf, type: 'item', parentId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}

// Create-then-assign for pickers: creates an item (nesting a full path under an
// existing group of the current tree) and resolves its id, or null on failure so
// the picker can keep the typed name and say so instead of surfacing a rejection.
export function useCreateDictionaryItem() {
  const { data: config } = useConfiguration();
  const create = useCreateDictionaryEntry();
  return async (dictId: string, name: string): Promise<UUID | null> => {
    try {
      const r = await create.mutateAsync({ dictId, name, dict: config?.dictionaries[dictId] });
      return r.id;
    } catch {
      return null;
    }
  };
}
