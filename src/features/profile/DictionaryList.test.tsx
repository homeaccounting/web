import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import type { DictionaryResponse } from '@/api/types';
import { DictionaryList } from './DictionaryList';

const apiBase = 'http://localhost:8080';
const dictId = 'expense';

// Food (group) -> [Groceries]; Salary (item) at root.
const treeDict: DictionaryResponse = {
  roots: [
    {
      id: 'food',
      name: 'Food',
      type: 'group',
      children: [{ id: 'gro', name: 'Groceries', type: 'item', children: [] }],
    },
    { id: 'salary', name: 'Salary', type: 'item', children: [] },
  ],
};

function setup(dict: DictionaryResponse = treeDict) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <DictionaryList dictId={dictId} title="Expense" dict={dict} addLabel="Add category" />
    </AuthProvider>,
  );
}

describe('DictionaryList', () => {
  it('renders items as full paths and groups with a marker', () => {
    setup();
    expect(screen.getByText('Food / Groceries')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
    // The group row shows its own name (not a path) plus a group marker.
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText(/group/i)).toBeInTheDocument();
  });

  it('shows "No entries yet" on an empty dictionary', () => {
    setup({ roots: [] });
    expect(screen.getByText(/no entries yet/i)).toBeInTheDocument();
  });

  it('add: creates a root-level item by default', async () => {
    let body: unknown = null;
    server.use(
      http.post(
        `${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'new', name: 'Transport' }, { status: 201 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add category/i }));
    await user.type(screen.getByRole('textbox', { name: /add category/i }), 'Transport');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ name: 'Transport', type: 'item', parentId: null }));
  });

  it('add: creates a group when the type is switched to group', async () => {
    let body: unknown = null;
    server.use(
      http.post(
        `${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'new', name: 'Leisure' }, { status: 201 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add category/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /entry type/i }), 'group');
    await user.type(screen.getByRole('textbox', { name: /add category/i }), 'Leisure');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ name: 'Leisure', type: 'group', parentId: null }));
  });

  it('add: nests an item under a chosen parent group', async () => {
    let body: unknown = null;
    server.use(
      http.post(
        `${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'new', name: 'Dining' }, { status: 201 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add category/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /parent group/i }), 'food');
    await user.type(screen.getByRole('textbox', { name: /add category/i }), 'Dining');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ name: 'Dining', type: 'item', parentId: 'food' }));
  });

  it('add: Escape cancels without sending a request', async () => {
    let called = 0;
    server.use(
      http.post(`${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries`, () => {
        called += 1;
        return HttpResponse.json({ id: 'x', name: 'x' }, { status: 201 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add category/i }));
    await user.type(screen.getByRole('textbox', { name: /add category/i }), 'Nope');
    await user.keyboard('{Escape}');
    expect(called).toBe(0);
    expect(screen.queryByRole('textbox', { name: /add category/i })).not.toBeInTheDocument();
  });

  it('rename: pencil → input → Enter → PUT', async () => {
    let body: unknown = null;
    server.use(
      http.put(
        `${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries/gro`,
        async ({ request }) => {
          body = await request.json();
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /rename food \/ groceries/i }));
    const input = screen.getByRole('textbox', { name: /rename food \/ groceries/i });
    await user.clear(input);
    await user.type(input, 'Supermarket');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(body).toEqual({ name: 'Supermarket' }));
  });

  it('move: changing the parent select PATCHes and closes the edit row (no Enter needed)', async () => {
    let moveBody: unknown = null;
    server.use(
      http.patch(
        `${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries/salary/parent`,
        async ({ request }) => {
          moveBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /rename salary/i }));
    // Picking a group applies the move immediately — no Enter.
    await user.selectOptions(screen.getByRole('combobox', { name: /move salary/i }), 'food');
    await waitFor(() => expect(moveBody).toEqual({ parentId: 'food' }));
    // The edit row is gone: the move select no longer exists.
    expect(screen.queryByRole('combobox', { name: /move salary/i })).not.toBeInTheDocument();
  });

  it('delete: trash → AlertDialog → Confirm → DELETE', async () => {
    let called = false;
    server.use(
      http.delete(
        `${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries/salary`,
        () => {
          called = true;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /delete salary/i }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('surfaces the backend error when deleting a non-empty group', async () => {
    server.use(
      http.delete(`${apiBase}/api/users/me/configuration/dictionaries/${dictId}/entries/food`, () =>
        HttpResponse.json(
          { message: 'Cannot remove a dictionary group that still has entries' },
          { status: 409 },
        ),
      ),
    );
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^delete food$/i }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/still has entries/i));
  });
});
