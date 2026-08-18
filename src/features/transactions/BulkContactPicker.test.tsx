import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { BulkContactPicker } from './BulkContactPicker';

const options: DictionaryEntryResponse[] = [
  { id: 'c1', name: 'SILPO' },
  { id: 'c2', name: 'ATB' },
];

type Overrides = Partial<React.ComponentProps<typeof BulkContactPicker>>;

function renderPicker(overrides: Overrides = {}) {
  const props = {
    options,
    onSelect: vi.fn(),
    onCreate: vi.fn((): Promise<UUID | null> => Promise.resolve(null)),
    ...overrides,
  };
  render(
    <ContextMenu>
      <ContextMenuTrigger>
        <div data-testid="target">row</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <BulkContactPicker {...props} />
      </ContextMenuContent>
    </ContextMenu>,
  );
  return props;
}

async function openSubmenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
  await user.hover(await screen.findByRole('menuitem', { name: /set contact/i }));
}

describe('BulkContactPicker', () => {
  it('picks a contact and calls onSelect with its id', async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'ATB' }),
    });
    expect(props.onSelect).toHaveBeenCalledWith('c2');
  });

  it('clears via the — none — row (onSelect(null))', async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('menuitem', { name: /none/i }),
    });
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('creates then assigns (onCreate → onSelect(newId))', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<UUID | null> => Promise.resolve('new-id'));
    const props = renderPicker({ onCreate });
    await openSubmenu(user);
    const box = await screen.findByRole('combobox', { name: /search contacts/i });
    box.focus();
    await user.keyboard('Acme Corp');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: /create ['‘]Acme Corp['’]/i }),
    });
    expect(onCreate).toHaveBeenCalledWith('Acme Corp');
    await vi.waitFor(() => expect(props.onSelect).toHaveBeenCalledWith('new-id'));
  });

  it('does not pick when disabled', async () => {
    const user = userEvent.setup();
    const props = renderPicker({ disabled: true });
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
    const trigger = await screen.findByRole('menuitem', { name: /set contact/i });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(props.onSelect).not.toHaveBeenCalled();
  });
});
