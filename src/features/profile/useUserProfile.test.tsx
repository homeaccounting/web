import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useUserProfile } from './useUserProfile';

describe('useUserProfile', () => {
  it('queries /api/users/me and returns the profile', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useUserProfile(), { wrapper });
    await waitFor(() => expect(result.current.data?.email).toBe('alice@example.com'));
  });
});
