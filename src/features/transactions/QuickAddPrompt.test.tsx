import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { QuickAddPrompt } from './QuickAddPrompt';

const apiBase = 'http://localhost:8080';
const accountId = '00000000-0000-0000-0000-000000000001';

// Spy on the toast wrapper (same seam the bulk-action tests use).
const toastSuccess = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: {
    success: (m: string) => {
      toastSuccess(m);
    },
    error: (m: string) => {
      // no-op: no test asserts on error toasts here
      void m;
    },
  },
}));

function ui() {
  return (
    <AuthProvider>
      <QuickAddPrompt accountId={accountId} accountName="Checking" />
    </AuthProvider>
  );
}

// Respond to POST /api/prompt with a fixed envelope for the test.
function respondPrompt(body: unknown, status = 200) {
  server.use(
    http.post(`${apiBase}/api/prompt`, () => HttpResponse.json(body as never, { status })),
  );
}

async function typeAndSubmit(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByLabelText('Quick add transaction');
  await user.type(input, value);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  return input as HTMLInputElement;
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  toastSuccess.mockClear();
});

describe('QuickAddPrompt', () => {
  it('shows the account name in the placeholder', () => {
    renderWithProviders(ui());
    expect(screen.getByLabelText('Quick add transaction')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Checking'),
    );
  });

  it('disables Add when the input is empty', () => {
    renderWithProviders(ui());
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('full success: toasts, clears the input, shows no alert', async () => {
    const user = userEvent.setup();
    respondPrompt({ kind: 'transactions', succeeded: [{ id: 'tx' }], failed: [] });
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Added 1 transaction.'));
    expect(input.value).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('total failure: keeps the text and lists reasons (1-based)', async () => {
    const user = userEvent.setup();
    respondPrompt({
      kind: 'transactions',
      succeeded: [],
      failed: [{ index: 0, reason: 'could not resolve account' }],
    });
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'taxi');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Item 1 — could not resolve account',
    );
    expect(input.value).toBe('taxi');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('partial: toasts the good part, clears the input, alerts the failures', async () => {
    const user = userEvent.setup();
    respondPrompt({
      kind: 'transactions',
      succeeded: [{ id: 'tx' }],
      failed: [{ index: 1, reason: 'could not resolve category' }],
    });
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'groceries 500, taxi 12');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Added 1 transaction.'));
    expect(input.value).toBe('');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Item 2 — could not resolve category',
    );
  });

  it('503: shows the unavailable message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'LLM feature disabled' }, 503);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quick add is unavailable right now.',
    );
    expect(input.value).toBe('coffee 4.50');
  });

  it('502: shows the retry/rephrase message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'LLM upstream error' }, 502);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    expect(await screen.findByRole('alert')).toHaveTextContent('please try again or rephrase');
    expect(input.value).toBe('coffee 4.50');
  });

  it('400: shows the backend message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'Amount must be positive', code: 'ValidationErr' }, 400);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee -1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Amount must be positive');
    expect(input.value).toBe('coffee -1');
  });

  it('unexpected status: shows the generic message and keeps the text', async () => {
    const user = userEvent.setup();
    respondPrompt({ message: 'boom' }, 500);
    renderWithProviders(ui());
    const input = await typeAndSubmit(user, 'coffee 4.50');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(input.value).toBe('coffee 4.50');
  });

  it('disables the input and shows "Adding…" while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    server.use(
      http.post(`${apiBase}/api/prompt`, async () => {
        await new Promise<void>((r) => {
          resolve = r;
        });
        return HttpResponse.json({ kind: 'transactions', succeeded: [{ id: 'tx' }], failed: [] });
      }),
    );
    renderWithProviders(ui());
    const input = screen.getByLabelText('Quick add transaction');
    await user.type(input, 'coffee 4.50');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    // In flight: button relabelled + disabled, input disabled.
    expect(await screen.findByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(input).toBeDisabled();
    // Resolve and confirm it returns to normal.
    resolve();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument());
  });

  it('dismiss (✕) clears the alert', async () => {
    const user = userEvent.setup();
    respondPrompt({ kind: 'transactions', succeeded: [], failed: [{ index: 0, reason: 'x' }] });
    renderWithProviders(ui());
    await typeAndSubmit(user, 'taxi');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
