import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
        <Route path="/accounts/:id" element={<HomePage />} />
      </Routes>
      <LocationSpy />
    </AuthProvider>
  );
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

  it('redirects from / to the last-viewed account with its period in the URL', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    writeLastView({
      accountId: accountFixture.id,
      period: 'this-month',
      filters: defaultFilters,
    });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText(new RegExp(`^/accounts/${accountFixture.id}\\?period=this-month$`));
  });

  it('does not redirect when the last-viewed account no longer exists', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    writeLastView({
      accountId: 'deleted-account',
      period: 'this-month',
      filters: defaultFilters,
    });
    renderWithProviders(ui(), { initialPath: '/' });
    // Wait for accounts to load (sidebar renders the known account), then
    // assert the URL stayed put.
    await screen.findByText(accountFixture.name);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('does not redirect when there is no last view', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText(accountFixture.name);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
