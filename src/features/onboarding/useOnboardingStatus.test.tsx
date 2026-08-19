import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture, transactionFixture } from '@/test/fixtures';
import { useOnboardingStatus } from './useOnboardingStatus';

const apiBase = 'http://localhost:8080';

function renderStatus() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  return renderHook(() => useOnboardingStatus(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
}

function mockConfig(overrides: Record<string, unknown>) {
  server.use(
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json({ ...configurationFixture, ...overrides }),
    ),
  );
}
function mockTransactions(rows: unknown[]) {
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({ transactions: rows, totalCount: rows.length, limit: 1, offset: 0 }),
    ),
  );
}

describe('useOnboardingStatus', () => {
  beforeEach(() => sessionStorage.clear());

  it('needs onboarding when country is null and there are no transactions', async () => {
    mockConfig({ country: null });
    mockTransactions([]);
    const { result } = renderStatus();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needsOnboarding).toBe(true);
  });

  it('does NOT need onboarding when a country is already set', async () => {
    mockConfig({ country: 'US' });
    mockTransactions([]);
    const { result } = renderStatus();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('does NOT need onboarding when transactions already exist (established user)', async () => {
    mockConfig({ country: null });
    mockTransactions([transactionFixture]);
    const { result } = renderStatus();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('does NOT need onboarding while data is still loading', () => {
    mockConfig({ country: null });
    mockTransactions([]);
    const { result } = renderStatus();
    // Synchronously, before queries resolve.
    expect(result.current.isPending).toBe(true);
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('skip() suppresses the nudge for the session', async () => {
    mockConfig({ country: null });
    mockTransactions([]);
    const { result } = renderStatus();
    await waitFor(() => expect(result.current.needsOnboarding).toBe(true));
    act(() => result.current.skip());
    await waitFor(() => expect(result.current.needsOnboarding).toBe(false));
    expect(sessionStorage.getItem('onboarding:skipped:u')).toBe('1');
  });
});
