import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Routes, Route, Link } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { AnalyticsTracker } from './AnalyticsTracker';
import * as analytics from '@/lib/analytics';

describe('AnalyticsTracker', () => {
  beforeEach(() => {
    vi.spyOn(analytics, 'trackPageview').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks the scrubbed path on first render', () => {
    renderWithProviders(<AnalyticsTracker />, { initialPath: '/transactions?account=abc' });
    expect(analytics.trackPageview).toHaveBeenCalledWith('/transactions');
  });

  it('tracks again on navigation', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AnalyticsTracker />
        <Routes>
          <Route path="/" element={<Link to="/reports">go</Link>} />
          <Route path="/reports" element={<div>reports</div>} />
        </Routes>
      </>,
      { initialPath: '/' },
    );
    expect(analytics.trackPageview).toHaveBeenLastCalledWith('/');
    await user.click(screen.getByText('go'));
    expect(analytics.trackPageview).toHaveBeenLastCalledWith('/reports');
  });
});
