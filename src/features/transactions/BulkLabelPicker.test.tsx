import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { TransactionResponse, UUID } from '@/api/types';
import { BulkLabelPicker } from './BulkLabelPicker';

const options = [
  { id: 'l1' as UUID, name: 'Trip' },
  { id: 'l2' as UUID, name: 'Work' },
];
const row = (labels: UUID[]) => ({ id: 'x', labels }) as unknown as TransactionResponse;

async function openSubmenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
  await user.hover(await screen.findByRole('menuitem', { name: /set labels/i }));
}

// Pick an option with a MouseLeft pointer press (not user.click): MenuSearchList
// commits on onMouseDown+preventDefault, and a plain click can dismiss the Radix
// submenu — this mirrors TxLabelQuickPicker.test.tsx's proven harness.
async function pickOption(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.pointer({ keys: '[MouseLeft]', target: await screen.findByRole('option', { name }) });
}

describe('BulkLabelPicker', () => {
  it('adds a label that is not on all rows', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger>
          <div data-testid="target">row</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <BulkLabelPicker
            options={options}
            rows={[row(['l1']), row([])]} // l1 = some, l2 = none
            onAdd={onAdd}
            onRemove={() => {}}
            onCreate={() => Promise.resolve(null)}
          />
        </ContextMenuContent>
      </ContextMenu>,
    );
    await openSubmenu(user);
    await pickOption(user, 'Work'); // 'none' → add
    expect(onAdd).toHaveBeenCalledWith('l2');
  });

  it('removes a label that is on all rows', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger>
          <div data-testid="target">row</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <BulkLabelPicker
            options={options}
            rows={[row(['l1']), row(['l1'])]} // l1 = all
            onAdd={() => {}}
            onRemove={onRemove}
            onCreate={() => Promise.resolve(null)}
          />
        </ContextMenuContent>
      </ContextMenu>,
    );
    await openSubmenu(user);
    await pickOption(user, 'Trip');
    expect(onRemove).toHaveBeenCalledWith('l1');
  });
});
