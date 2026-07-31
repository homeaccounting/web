import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { TransactionResponse, UUID } from '@/api/types';
import { BulkTransactionMenu } from './BulkTransactionMenu';
import type { BulkCategoryEligibility } from './bulkLabels';

const base = {
  count: 3,
  rows: [] as TransactionResponse[],
  labelOptions: [{ id: 'l1' as UUID, name: 'Trip' }],
  incomeCategoryEntries: [],
  expenseCategoryEntries: [{ id: 'c1' as UUID, name: 'Food' }],
  labelsEnabled: true,
  isApplying: false,
  onSetCategory: vi.fn(),
  onAddLabel: vi.fn(),
  onRemoveLabel: vi.fn(),
  onCreateLabel: () => Promise.resolve(null),
  canLink: false,
  canMerge: true,
  mergeDisabledReason: undefined as string | undefined,
  onLink: vi.fn(),
  onMerge: vi.fn(),
};

function renderMenu(
  props: Partial<typeof base> & { categoryEligibility: BulkCategoryEligibility },
) {
  return render(
    <ContextMenu>
      <ContextMenuTrigger>
        <div data-testid="target">row</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <BulkTransactionMenu {...base} {...props} />
      </ContextMenuContent>
    </ContextMenu>,
  );
}
const open = (user: ReturnType<typeof userEvent.setup>) =>
  user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });

describe('BulkTransactionMenu', () => {
  it('shows the count and a disabled category reason when ineligible', async () => {
    const user = userEvent.setup();
    renderMenu({
      categoryEligibility: {
        enabled: false,
        reason: 'Select transactions of one type to set a category',
      },
    });
    await open(user);
    expect(await screen.findByText(/3 selected/i)).toBeInTheDocument();
    expect(screen.getByText(/one type to set a category/i)).toBeInTheDocument();
  });

  it('shows the merge-disabled reason as a subtitle without lengthening the item', async () => {
    const user = userEvent.setup();
    renderMenu({
      categoryEligibility: { enabled: true, type: 'expense' },
      canMerge: false,
      mergeDisabledReason: 'A transfer needs two different accounts.',
    });
    await open(user);
    // The item's accessible name stays just "Merge" (reason is a separate line).
    const item = await screen.findByRole('menuitem', { name: /^merge$/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/two different accounts/i)).toBeInTheDocument();
  });

  it('fires onMerge but hides Link when canLink is false', async () => {
    const user = userEvent.setup();
    const onMerge = vi.fn();
    renderMenu({
      categoryEligibility: { enabled: true, type: 'expense' },
      onMerge,
      canLink: false,
    });
    await open(user);
    expect(screen.queryByRole('menuitem', { name: /^link$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /^merge$/i }));
    expect(onMerge).toHaveBeenCalled();
  });
});
