import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import App from './App';

describe('App routing', () => {
  it('redirects the bare /accounts path to the home page', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <App />
      </AuthProvider>,
      { initialPath: '/accounts' },
    );
    // Lands on Home (accounts pane renders the seeded account), not NotFound.
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.queryByText('Not found.')).not.toBeInTheDocument();
  });
});
