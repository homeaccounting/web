import { describe, expect, it } from 'vitest';
import { Routes, Route, MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { saveSession } from './storage';

function Setup({ initial }: { initial: string }) {
  return (
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
  );
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    render(<Setup initial="/" />);
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
  it('renders the protected child when authenticated', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    render(<Setup initial="/" />);
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
