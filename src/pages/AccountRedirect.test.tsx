import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import AccountRedirect from './AccountRedirect';

// MemoryRouter does not update window.location; surface the current
// pathname+search through useLocation so tests can assert the redirect.
function LocationSpy() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function ui() {
  return (
    <>
      <Routes>
        <Route path="/accounts/:id" element={<AccountRedirect />} />
        <Route path="/transactions" element={<div>transactions</div>} />
      </Routes>
      <LocationSpy />
    </>
  );
}

function parseLocation(text: string): { pathname: string; params: URLSearchParams } {
  const qIndex = text.indexOf('?');
  const pathname = qIndex === -1 ? text : text.slice(0, qIndex);
  const params = new URLSearchParams(qIndex === -1 ? '' : text.slice(qIndex + 1));
  return { pathname, params };
}

describe('AccountRedirect', () => {
  it('redirects /accounts/:id to /transactions?accounts=:id, preserving other search params', async () => {
    renderWithProviders(ui(), { initialPath: '/accounts/a1?period=this-year' });
    const el = await screen.findByTestId('location');
    const { pathname, params } = parseLocation(el.textContent ?? '');
    expect(pathname).toBe('/transactions');
    expect(params.get('accounts')).toBe('a1');
    expect(params.get('period')).toBe('this-year');
  });

  it('overrides an existing accounts param with the path :id', async () => {
    renderWithProviders(ui(), { initialPath: '/accounts/a1?accounts=old' });
    const el = await screen.findByTestId('location');
    const { pathname, params } = parseLocation(el.textContent ?? '');
    expect(pathname).toBe('/transactions');
    expect(params.get('accounts')).toBe('a1');
  });
});
