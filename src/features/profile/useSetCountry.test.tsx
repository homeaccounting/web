import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useProviders } from '@/features/banking/useProviders';
import { toast } from '@/lib/toast';
import { useSetCountry } from './useSetCountry';

vi.mock('@/lib/toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

// Mounts a `useConfiguration` observer in the SAME QueryClientProvider as the
// hook under test, so the post-mutation `invalidateQueries` actually refetches
// and `getQueryData` sees fresh config.
function renderBoth() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => ({ config: useConfiguration(), setCountry: useSetCountry() }), {
    wrapper,
  });
}

describe('useSetCountry', () => {
  it('sends PUT and invalidates configuration on success', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.put('http://localhost:8080/api/users/me/configuration/country', async ({ request }) => {
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderBoth();
    await waitFor(() => expect(result.current.config.isSuccess).toBe(true));
    result.current.setCountry.mutate({ country: 'UA' });
    await waitFor(() => expect(result.current.setCountry.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ country: 'UA' });
  });

  it('toasts the changed value when the refetched config differs', async () => {
    vi.mocked(toast.success).mockClear();
    const { result } = renderBoth();
    // Seed the pre-mutation cache with the default fixture (defaultCurrency USD).
    await waitFor(() => expect(result.current.config.isSuccess).toBe(true));
    // Make the post-mutation refetch return a changed defaultCurrency.
    server.use(
      http.get('http://localhost:8080/api/users/me/configuration', () =>
        HttpResponse.json({ ...configurationFixture, defaultCurrency: 'UAH' }),
      ),
    );
    result.current.setCountry.mutate({ country: 'UA' });
    await waitFor(() => expect(result.current.setCountry.isSuccess).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toContain('UAH');
  });

  it('refetches providers on success so the inUserCountry grouping updates', async () => {
    // Provider `inUserCountry` is computed server-side from the user's country,
    // so changing country must refetch ['providers'] — otherwise the connect /
    // bank-name pickers keep showing the old country grouping until a reload.
    let providerHits = 0;
    server.use(
      http.get('http://localhost:8080/api/users/me/configuration/banking/providers', () => {
        providerHits += 1;
        return HttpResponse.json([]);
      }),
    );
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({
        config: useConfiguration(),
        providers: useProviders(),
        setCountry: useSetCountry(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.config.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.providers.isSuccess).toBe(true));
    const before = providerHits;
    result.current.setCountry.mutate({ country: 'UA' });
    await waitFor(() => expect(result.current.setCountry.isSuccess).toBe(true));
    await waitFor(() => expect(providerHits).toBeGreaterThan(before));
  });

  it('does not toast when the refetched config is identical', async () => {
    vi.mocked(toast.success).mockClear();
    const { result } = renderBoth();
    await waitFor(() => expect(result.current.config.isSuccess).toBe(true));
    result.current.setCountry.mutate({ country: 'UA' });
    await waitFor(() => expect(result.current.setCountry.isSuccess).toBe(true));
    // Give any pending refetch a chance to settle before asserting no toast.
    await waitFor(() => expect(result.current.config.isFetching).toBe(false));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
