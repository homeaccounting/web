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
import { AnalyticsTracker } from '@/features/analytics/AnalyticsTracker';
import { routerBasename } from '@/lib/basePath';
import { DemoBanner } from '@/demo/DemoBanner';
import App from './App';

// The published sandbox (demo.homeaccounting.com) sets both flags; the
// screenshot harness sets only VITE_DEMO, so demo chrome stays out of captures.
const isPublicDemo = import.meta.env.VITE_DEMO_PUBLIC === 'true';

async function bootstrap() {
  if (import.meta.env.VITE_DEMO === 'true') {
    const { startDemoWorker } = await import('./demo/browser');
    try {
      await startDemoWorker();
    } catch (err) {
      // No worker means nothing is mocked and every request fails against an
      // API this build does not have. Explain that rather than render a shell.
      console.error('demo: service worker failed to start', err);
      const { renderDemoUnavailable } = await import('./demo/unavailable');
      renderDemoUnavailable(document.getElementById('root') as HTMLElement);
      return;
    }
  }
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <BrowserRouter basename={routerBasename()}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {isPublicDemo && <DemoBanner />}
            <LanguageSync />
            <AnalyticsTracker />
            <App />
            <Toaster />
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
void bootstrap();
