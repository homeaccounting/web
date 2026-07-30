import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { writeLastView } from '@/features/transactions/lastView';
import { accountFixture } from '@/test/fixtures';
import HomePage from './HomePage';

// MemoryRouter does not update window.location; surface the current
// pathname+search through useLocation so tests can assert the redirect.
function LocationSpy() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/transactions" element={<HomePage />} />
      </Routes>
      <LocationSpy />
    </AuthProvider>
  );
}

function parseLocation(text: string): { pathname: string; params: URLSearchParams } {
  const qIndex = text.indexOf('?');
  const pathname = qIndex === -1 ? text : text.slice(0, qIndex);
  const params = new URLSearchParams(qIndex === -1 ? '' : text.slice(qIndex + 1));
  return { pathname, params };
}

const defaultFilters = {
  description: '',
  labelIds: [],
  category: '',
  contactId: '',
  showCancelledFailed: false,
};

describe('HomePage cold-start redirect', () => {
  beforeEach(() => localStorage.clear());

  it('redirects from / to /transactions with the last-viewed account scope + period in the URL', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    writeLastView({
      accounts: [accountFixture.id],
      period: 'this-month',
      filters: defaultFilters,
    });
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).not.toBe('/');
    });
    const el = screen.getByTestId('location');
    const { pathname, params } = parseLocation(el.textContent ?? '');
    expect(pathname).toBe('/transactions');
    expect(params.get('accounts')).toBe(accountFixture.id);
    expect(params.get('period')).toBe('this-month');
  });

  it('redirects from / to /transactions scoped to all accounts when the last-viewed account no longer exists', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    writeLastView({
      accounts: ['deleted-account'],
      period: 'this-month',
      filters: defaultFilters,
    });
    renderWithProviders(ui(), { initialPath: '/' });
    // Wait for accounts to load (sidebar renders the known account), then
    // assert the redirect dropped the unknown id and fell back to all-accounts.
    await screen.findByText(accountFixture.name);
    const el = screen.getByTestId('location');
    const { pathname, params } = parseLocation(el.textContent ?? '');
    expect(pathname).toBe('/transactions');
    expect(params.get('accounts')).toBeNull();
    expect(params.get('period')).toBe('this-month');
  });

  it('redirects from / to /transactions scoped to all accounts when there is no last view', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText(accountFixture.name);
    const el = screen.getByTestId('location');
    const { pathname, params } = parseLocation(el.textContent ?? '');
    expect(pathname).toBe('/transactions');
    expect(params.get('accounts')).toBeNull();
  });
});
