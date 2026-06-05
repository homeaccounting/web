import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { DictionaryList } from './DictionaryList';

const apiBase = 'http://localhost:8080';

function setup(entries: { id: string; name: string }[] = [{ id: 'l-1', name: 'travel' }]) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <DictionaryList dictId="labels" title="Labels" entries={entries} addLabel="Add label" />
    </AuthProvider>,
  );
}

describe('DictionaryList', () => {
  it('renders one row per entry', () => {
    setup();
    expect(screen.getByText('travel')).toBeInTheDocument();
  });

  it('shows "No entries yet" on empty list', () => {
    setup([]);
    expect(screen.getByText(/no entries yet/i)).toBeInTheDocument();
  });

  it('add: click button → input → Enter → POST', async () => {
    let body: unknown = null;
    server.use(
      http.post(
        `${apiBase}/api/users/me/configuration/dictionaries/labels/entries`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'new', name: 'trip' }, { status: 201 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add label/i }));
    const input = screen.getByRole('textbox', { name: /add label/i });
    await user.type(input, 'trip');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ name: 'trip' }));
  });

  it('add: Escape cancels without sending request', async () => {
    let called = 0;
    server.use(
      http.post(`${apiBase}/api/users/me/configuration/dictionaries/labels/entries`, () => {
        called += 1;
        return HttpResponse.json({ id: 'x', name: 'x' }, { status: 201 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add label/i }));
    const input = screen.getByRole('textbox', { name: /add label/i });
    await user.type(input, 'trip');
    await user.keyboard('{Escape}');
    expect(called).toBe(0);
    expect(screen.queryByRole('textbox', { name: /add label/i })).not.toBeInTheDocument();
  });

  it('rename: pencil → input → Enter → PUT', async () => {
    let body: unknown = null;
    server.use(
      http.put(
        `${apiBase}/api/users/me/configuration/dictionaries/labels/entries/l-1`,
        async ({ request }) => {
          body = await request.json();
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /rename travel/i }));
    const input = screen.getByRole('textbox', { name: /rename travel/i });
    await user.clear(input);
    await user.type(input, 'vacation');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ name: 'vacation' }));
  });

  it('delete: trash → AlertDialog → Confirm → DELETE', async () => {
    let called = false;
    server.use(
      http.delete(`${apiBase}/api/users/me/configuration/dictionaries/labels/entries/l-1`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /delete travel/i }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('shows inline Alert on a 409 from remove', async () => {
    server.use(
      http.delete(`${apiBase}/api/users/me/configuration/dictionaries/labels/entries/l-1`, () =>
        HttpResponse.json({ message: 'Label still in use' }, { status: 409 }),
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /delete travel/i }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/label still in use/i));
    expect(screen.getByText('travel')).toBeInTheDocument();
  });
});
