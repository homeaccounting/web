import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders, makeQueryClient } from '@/test/utils';
import { profileFixture, telegramLinkCodeFixture } from '@/test/fixtures';
import { ApiClient } from '@/api/client';
import { usersApi } from '@/api/users';
import { LinkTelegramDialog } from './LinkTelegramDialog';

const apiBase = 'http://localhost:8080';

function makeClient() {
  return new ApiClient({
    baseUrl: apiBase,
    getToken: () => 'test-token',
    onUnauthorized: () => {},
  });
}

describe('LinkTelegramDialog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-fires window.open with the deep link once on success', async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
    );

    await screen.findByRole('link', { name: /open telegram/i });
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith(
      telegramLinkCodeFixture.deepLink,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('reopening fires the mutation again and reopens the popup', async () => {
    let calls = 0;
    server.use(
      http.post(`${apiBase}/api/auth/telegram/link-code`, () => {
        calls += 1;
        return HttpResponse.json(telegramLinkCodeFixture);
      }),
    );

    const onOpenChange = vi.fn();
    const client = makeClient();
    const queryClient = makeQueryClient();
    const { rerender } = renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={client} />,
      { queryClient },
    );
    await screen.findByRole('link', { name: /open telegram/i });
    expect(calls).toBe(1);
    expect(window.open).toHaveBeenCalledTimes(1);

    rerender(<LinkTelegramDialog open={false} onOpenChange={onOpenChange} client={client} />);
    rerender(<LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={client} />);

    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(2));
  });

  it('renders the error alert and retries on click', async () => {
    let calls = 0;
    server.use(
      http.post(`${apiBase}/api/auth/telegram/link-code`, () => {
        calls += 1;
        if (calls === 1) return new HttpResponse('boom', { status: 500 });
        return HttpResponse.json(telegramLinkCodeFixture);
      }),
    );

    const onOpenChange = vi.fn();
    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
    );

    await screen.findByRole('alert');
    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
    await screen.findByRole('link', { name: /open telegram/i });
    expect(calls).toBe(2);
  });

  it('auto-closes 1.5s after the linked state is entered', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({
          ...profileFixture,
          telegramIdentity: { id: 42, username: 'alice', firstName: 'Alice' },
        }),
      ),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onOpenChange = vi.fn();
      const queryClient = makeQueryClient();
      await queryClient.fetchQuery({
        queryKey: ['users', 'me'],
        queryFn: () => usersApi(makeClient()).getMe(),
      });
      renderWithProviders(
        <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
        { queryClient },
      );

      await screen.findByText(/linked as @alice/i);
      expect(onOpenChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1500);
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the linked state when the cached profile gains a telegramIdentity', async () => {
    let linked = false;
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json(
          linked
            ? {
                ...profileFixture,
                telegramIdentity: { id: 42, username: 'alice', firstName: 'Alice' },
              }
            : profileFixture,
        ),
      ),
    );

    const queryClient = makeQueryClient();
    await queryClient.fetchQuery({
      queryKey: ['users', 'me'],
      queryFn: () => usersApi(makeClient()).getMe(),
    });

    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={() => {}} client={makeClient()} />,
      { queryClient },
    );

    await screen.findByRole('link', { name: /open telegram/i });
    linked = true;
    await userEvent.setup().click(screen.getByRole('button', { name: /i.*linked it/i }));
    expect(await screen.findByText(/linked as @alice/i)).toBeInTheDocument();
  });

  it('clicking "I have linked it" refetches the profile', async () => {
    let profileCalls = 0;
    server.use(
      http.get(`${apiBase}/api/users/me`, () => {
        profileCalls += 1;
        return HttpResponse.json(profileFixture);
      }),
    );

    const queryClient = makeQueryClient();
    await queryClient.fetchQuery({
      queryKey: ['users', 'me'],
      queryFn: () => usersApi(makeClient()).getMe(),
    });
    expect(profileCalls).toBe(1);

    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={() => {}} client={makeClient()} />,
      { queryClient },
    );

    await screen.findByRole('link', { name: /open telegram/i });
    const before = profileCalls;
    await userEvent.setup().click(screen.getByRole('button', { name: /i.*linked it/i }));
    await waitFor(() => expect(profileCalls).toBe(before + 1));
  });

  it('renders the expires-at time formatted as a local HH:MM string', async () => {
    const expected = new Date(telegramLinkCodeFixture.expiresAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={() => {}} client={makeClient()} />,
    );
    await screen.findByRole('link', { name: /open telegram/i });
    expect(screen.getByText(new RegExp(expected.replace(/\s/g, '\\s')))).toBeInTheDocument();
  });

  it('fires POST /api/auth/telegram/link-code once on open and renders the deep link', async () => {
    let callCount = 0;
    server.use(
      http.post(`${apiBase}/api/auth/telegram/link-code`, () => {
        callCount += 1;
        return HttpResponse.json(telegramLinkCodeFixture);
      }),
    );

    const onOpenChange = vi.fn();
    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
    );

    const link = await screen.findByRole('link', { name: /open telegram/i });
    expect(link).toHaveAttribute('href', telegramLinkCodeFixture.deepLink);
    expect(link).toHaveAttribute('target', '_blank');
    expect(callCount).toBe(1);
  });
});
