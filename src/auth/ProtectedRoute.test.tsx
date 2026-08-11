import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route, MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/server';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { saveSession } from './storage';

const apiBase = 'http://localhost:8080';

function Setup({ initial, queryClient }: { initial: string; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/login" element={<div>login screen</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<div>home</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    render(<Setup initial="/" queryClient={new QueryClient()} />);
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
  it('renders the protected child when authenticated', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    render(<Setup initial="/" queryClient={new QueryClient()} />);
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('mounts the data-change signal for authenticated users, invalidating caches on a version change', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    let version = 5;
    server.use(http.get(`${apiBase}/api/sync/version`, () => HttpResponse.json({ version })));

    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    render(<Setup initial="/" queryClient={queryClient} />);
    expect(screen.getByText('home')).toBeInTheDocument();

    await waitFor(() => expect(queryClient.getQueryData(['sync', 'version'])).toBe(5));
    expect(spy).not.toHaveBeenCalled();

    version = 6;
    await queryClient.invalidateQueries({ queryKey: ['sync', 'version'] });
    await waitFor(() => expect(queryClient.getQueryData(['sync', 'version'])).toBe(6));

    const invalidatedKeys = spy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([['accounts'], ['transactions']]));
  });
});
