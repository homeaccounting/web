import '@fontsource-variable/inter';
import './styles/globals.css';
import './lib/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthContext';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/sonner';
import { LanguageSync } from '@/features/i18n/LanguageSync';
import App from './App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter basename="/app">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageSync />
          <App />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
