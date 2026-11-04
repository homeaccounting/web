import { useRef, useState } from 'react';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

// Creates a new entry from a typed name and resolves its id, or null on failure.
export type CreateEntry = (name: string) => Promise<UUID | null>;

// Normalize a typed name: trim ends and collapse internal whitespace runs.
export const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ');

// The name a "Create '<name>'" row would create, or null when the row shouldn't
// show: a blank query, or an option already matches it (case-insensitive).
export function createCandidate(query: string, options: DictionaryEntryResponse[]): string | null {
  const name = normalizeName(query);
  if (!name) return null;
  const lower = name.toLowerCase();
  return options.some((o) => o.name.toLowerCase() === lower) ? null : name;
}

// Create-then-assign for form pickers. Ignores a second create while one is in
// flight (a double Enter would otherwise create the entry twice) and remembers
// the name that failed so the picker can keep it in the input and say so.
export function useInlineCreate(onCreate: CreateEntry | undefined) {
  const pending = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);

  const create = async (name: string, onCreated: (id: UUID) => void, onFailed?: () => void) => {
    if (!onCreate || pending.current) return;
    pending.current = true;
    setFailed(null);
    try {
      const id = await onCreate(name);
      if (id) onCreated(id);
      else {
        setFailed(name);
        onFailed?.();
      }
    } finally {
      pending.current = false;
    }
  };

  return { create, failed };
}
