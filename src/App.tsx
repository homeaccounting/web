import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import HomePage from '@/pages/HomePage';
import AccountRedirect from '@/pages/AccountRedirect';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import OAuthCallbackPage from '@/pages/OAuthCallbackPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ProfilePage from '@/pages/ProfilePage';
import ReportsPage from '@/pages/ReportsPage';
import OnboardingPage from '@/pages/OnboardingPage';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/oauth/:provider/callback" element={<OAuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={
            <OnboardingGate>
              <HomePage />
            </OnboardingGate>
          }
        />
        <Route
          path="/transactions"
          element={
            <OnboardingGate>
              <HomePage />
            </OnboardingGate>
          }
        />
        <Route path="/onboarding" element={<OnboardingPage />} />
        {/* Legacy account-scoped URLs redirect to the canonical /transactions route. */}
        <Route path="/accounts" element={<Navigate to="/transactions" replace />} />
        <Route path="/accounts/:id" element={<AccountRedirect />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:tab" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
