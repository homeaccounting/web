import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { scrubPath, trackPageview } from '@/lib/analytics';

/** Reports each SPA navigation to GoatCounter as a scrubbed route path. */
export function AnalyticsTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageview(scrubPath(pathname));
  }, [pathname]);
  return null;
}
