import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import { useConfiguration } from './useConfiguration';
import { useCreateDictionaryEntry, useCreateDictionaryItem } from './useCreateDictionaryEntry';

describe('useCreateDictionaryEntry', () => {
  it('POSTs a root-level item to /dictionaries/:dictId/entries and returns the entry', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.post(
        'http://localhost:8080/api/users/me/configuration/dictionaries/contact/entries',
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'contact-1', name: 'Silpo' }, { status: 201 });
        },
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateDictionaryEntry(), { wrapper });

    const created = await result.current.mutateAsync({ dictId: 'contact', name: 'Silpo' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toEqual({ name: 'Silpo', type: 'item', parentId: null });
    expect(created).toEqual({ id: 'contact-1', name: 'Silpo' });
    expect(result.current.data).toEqual({ id: 'contact-1', name: 'Silpo' });
  });

  it('nests the item under an existing group when the name is a full path', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.post(
        'http://localhost:8080/api/users/me/configuration/dictionaries/contact/entries',
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'contact-2', name: 'Coffee' }, { status: 201 });
        },
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateDictionaryEntry(), { wrapper });

    await result.current.mutateAsync({
      dictId: 'contact',
      name: 'Shops / Coffee',
      dict: { roots: [{ id: 'shops', name: 'Shops', type: 'group', children: [] }] },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Leaf name + the matched group's id as parentId.
    expect(body).toEqual({ name: 'Coffee', type: 'item', parentId: 'shops' });
  });

  it('invalidates the configuration query on success', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.post('http://localhost:8080/api/users/me/configuration/dictionaries/label/entries', () =>
        HttpResponse.json({ id: 'label-1', name: 'trip' }, { status: 201 }),
      ),
    );
    const client = makeQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateDictionaryEntry(), { wrapper });

    await result.current.mutateAsync({ dictId: 'label', name: 'trip' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configuration'] });
  });
});

describe('useCreateDictionaryItem', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={makeQueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  it('resolves the created entry id, nesting a full path under an existing group', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.get('http://localhost:8080/api/users/me/configuration', () =>
        HttpResponse.json({
          ...configurationFixture,
          dictionaries: {
            ...configurationFixture.dictionaries,
            label: { roots: [{ id: 'travel', name: 'Travel', type: 'group', children: [] }] },
          },
        }),
      ),
      http.post(
        'http://localhost:8080/api/users/me/configuration/dictionaries/label/entries',
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'label-9', name: 'Rome' }, { status: 201 });
        },
      ),
    );
    const { result } = renderHook(
      () => ({ create: useCreateDictionaryItem(), config: useConfiguration() }),
      { wrapper },
    );

    // The tree is read from the configuration query, so wait until it loads.
    await waitFor(() => expect(result.current.config.data).toBeDefined());
    const id = await result.current.create('label', 'Travel / Rome');

    expect(id).toBe('label-9');
    expect(body).toEqual({ name: 'Rome', type: 'item', parentId: 'travel' });
  });

  it('resolves null when the create fails', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.post(
        'http://localhost:8080/api/users/me/configuration/dictionaries/contact/entries',
        () => HttpResponse.json({ code: 'conflict', message: 'exists' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useCreateDictionaryItem(), { wrapper });

    expect(await result.current('contact', 'Silpo')).toBeNull();
  });
});
