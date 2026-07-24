import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { TxLabelQuickPicker } from './TxLabelQuickPicker';

const baseOptions: DictionaryEntryResponse[] = [
  { id: 'l1', name: 'Trip' },
  { id: 'l2', name: 'Work' },
];

// Right-click the trigger, then hover the "Labels" sub-trigger to open the submenu.
async function openSubmenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
  await user.hover(await screen.findByRole('menuitem', { name: /^labels$/i }));
}

// Type into the search box. MenuSearchList auto-focuses on mount; we focus it
// explicitly (a pointer-click via user.type would dismiss the Radix submenu) and
// drive keystrokes with user.keyboard.
async function typeQuery(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = await screen.findByRole('combobox', { name: /search labels/i });
  box.focus();
  await user.keyboard(text);
}

// A controlled harness that mimics the parent: a committed label array is fed
// back as `value` (as the real edit mutation + refetch would), and onCreate
// materialises the entry into the options list and returns its id — so the
// picker can render the freshly-created label as selected. Each committed array
// is recorded in `commits` for assertions.
function LabelHarness({
  commits,
  onCreate,
}: {
  commits: UUID[][];
  onCreate: (name: string) => Promise<UUID | null>;
}) {
  const [options, setOptions] = useState(baseOptions);
  const [value, setValue] = useState<UUID[]>([]);
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div data-testid="target">row</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <TxLabelQuickPicker
          options={options}
          value={value}
          onCommit={(labels) => {
            commits.push(labels);
            setValue(labels);
            return Promise.resolve();
          }}
          onCreate={async (name) => {
            const id = await onCreate(name);
            if (id) setOptions((o) => [...o, { id, name }]);
            return id;
          }}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

describe('TxLabelQuickPicker', () => {
  it('toggles multiple labels via cumulative, ordered commits', async () => {
    const user = userEvent.setup();
    const commits: UUID[][] = [];
    render(<LabelHarness commits={commits} onCreate={() => Promise.resolve(null)} />);
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'Trip' }),
    });
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'Work' }),
    });
    await vi.waitFor(() => expect(commits).toEqual([['l1'], ['l1', 'l2']]));
  });

  it('creates a label and appends it through the serialized commit path', async () => {
    const user = userEvent.setup();
    const commits: UUID[][] = [];
    const onCreate = vi.fn((): Promise<UUID | null> => Promise.resolve('created-id'));
    render(<LabelHarness commits={commits} onCreate={onCreate} />);
    await openSubmenu(user);
    await typeQuery(user, 'Vacation');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: /create ['‘]Vacation['’]/i }),
    });
    expect(onCreate).toHaveBeenCalledWith('Vacation');
    // The returned id is appended through the same commit path (not a separate PUT).
    await vi.waitFor(() => expect(commits).toEqual([['created-id']]));
    // The freshly-created label now shows selected in the picker.
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: 'Vacation' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });

  it('composes a create followed by a toggle into cumulative commits', async () => {
    const user = userEvent.setup();
    const commits: UUID[][] = [];
    const onCreate = vi.fn((): Promise<UUID | null> => Promise.resolve('created-id'));
    render(<LabelHarness commits={commits} onCreate={onCreate} />);
    await openSubmenu(user);
    await typeQuery(user, 'Vacation');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: /create ['‘]Vacation['’]/i }),
    });
    await vi.waitFor(() => expect(commits).toEqual([['created-id']]));
    // Clear the query so the existing options are visible again, then toggle Trip.
    // Select-all + Backspace via the keyboard (a pointer-click clear would dismiss
    // the submenu).
    const box = screen.getByRole('combobox', { name: /search labels/i });
    box.focus();
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'Trip' }),
    });
    // The second commit carries the cumulative set (created + toggled).
    await vi.waitFor(() => expect(commits).toEqual([['created-id'], ['created-id', 'l1']]));
  });
});
