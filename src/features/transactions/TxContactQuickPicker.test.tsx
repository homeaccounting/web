import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { TxContactQuickPicker } from './TxContactQuickPicker';

const options: DictionaryEntryResponse[] = [
  { id: 'c1', name: 'SILPO' },
  { id: 'c2', name: 'ATB' },
  { id: 'c3', name: 'Rozetka' },
];

type Overrides = Partial<React.ComponentProps<typeof TxContactQuickPicker>>;

function renderPicker(overrides: Overrides = {}) {
  const props = {
    options,
    value: null as UUID | null,
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
        <TxContactQuickPicker {...props} />
      </ContextMenuContent>
    </ContextMenu>,
  );
  return props;
}

// Right-click the trigger, then hover the "Contact" sub-trigger to open the submenu.
async function openSubmenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
  await user.hover(await screen.findByRole('menuitem', { name: /^contact$/i }));
}

// Type into the search box. MenuSearchList auto-focuses on mount; we focus it
// explicitly (a pointer-click via user.type would dismiss the Radix submenu) and
// drive keystrokes with user.keyboard.
async function typeQuery(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = await screen.findByRole('combobox', { name: /search contacts/i });
  box.focus();
  await user.keyboard(text);
}

describe('TxContactQuickPicker', () => {
  it('renders a Contact submenu trigger', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
    expect(await screen.findByRole('menuitem', { name: /^contact$/i })).toBeInTheDocument();
  });

  it('marks the current contact as selected', async () => {
    const user = userEvent.setup();
    renderPicker({ value: 'c2' });
    await openSubmenu(user);
    expect(await screen.findByRole('option', { name: 'ATB' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'SILPO' })).toHaveAttribute('aria-selected', 'false');
  });

  it('picks an option and calls onSelect with its id', async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'Rozetka' }),
    });
    expect(props.onSelect).toHaveBeenCalledWith('c3');
  });

  it('clears the contact via the — none — row (onSelect(null))', async () => {
    const user = userEvent.setup();
    const props = renderPicker({ value: 'c1' });
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('menuitem', { name: /none/i }),
    });
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('creates a new contact then assigns it (onCreate → onSelect(newId))', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<UUID | null> => Promise.resolve('new-id'));
    const props = renderPicker({ onCreate });
    await openSubmenu(user);
    await typeQuery(user, 'Acme Corp');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: /create ['‘]Acme Corp['’]/i }),
    });
    expect(onCreate).toHaveBeenCalledWith('Acme Corp');
    await vi.waitFor(() => expect(props.onSelect).toHaveBeenCalledWith('new-id'));
  });

  it('does not assign when create resolves to null', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<UUID | null> => Promise.resolve(null));
    const props = renderPicker({ onCreate });
    await openSubmenu(user);
    await typeQuery(user, 'Acme Corp');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: /create ['‘]Acme Corp['’]/i }),
    });
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledWith('Acme Corp'));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('forwards createHint (the Use: affordance appears)', async () => {
    const user = userEvent.setup();
    renderPicker({ createHint: '  SILPO 123  ' });
    await openSubmenu(user);
    expect(await screen.findByRole('button', { name: /use: SILPO 123/i })).toBeInTheDocument();
  });
});
