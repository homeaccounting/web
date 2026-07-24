import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileDictionariesPane } from './ProfileDictionariesPane';

const configUrl = 'http://localhost:8080/api/users/me/configuration';

function setup() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  return renderWithProviders(
    <AuthProvider>
      <ProfileDictionariesPane />
    </AuthProvider>,
  );
}

describe('ProfileDictionariesPane', () => {
  it('renders four tabs in order: Expense, Income, Contact, Label', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(4));
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Expense', 'Income', 'Contact', 'Label']);
  });

  it('shows the Expense dictionary by default', async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add expense category' })).toBeInTheDocument(),
    );
    // Expense fixture seeds "Food"; the Expense tab is selected by default.
    expect(screen.getByRole('tab', { name: 'Expense' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Food')).toBeInTheDocument();
    // Only the active panel is mounted, so other dictionaries' add buttons are absent.
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument();
  });

  it('switches to the Income tab and shows the income dictionary', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Income' })).toBeInTheDocument());
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Income' }));
    expect(await screen.findByRole('button', { name: 'Add income category' })).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
  });

  it('switches to the Contact tab wired to dictionaries.contact with "Add contact"', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Contact' })).toBeInTheDocument());
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Contact' }));
    expect(await screen.findByRole('button', { name: 'Add contact' })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('switches to the Label tab and shows the label dictionary', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Label' })).toBeInTheDocument());
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Label' }));
    expect(await screen.findByRole('button', { name: 'Add label' })).toBeInTheDocument();
    expect(screen.getByText('Trip')).toBeInTheDocument();
  });

  it('shows a skeleton while configuration is loading', () => {
    const { container } = setup();
    // First render is pending — the skeleton is shown before the query resolves.
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('shows an error alert with a Retry button when configuration fails to load', async () => {
    server.use(http.get(configUrl, () => HttpResponse.json({}, { status: 500 })));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load configuration/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
