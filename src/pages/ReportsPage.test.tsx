import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import ReportsPage from './ReportsPage';

describe('ReportsPage', () => {
  it('renders the reports view at /reports', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </AuthProvider>,
      { initialPath: '/reports' },
    );
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  });
});
