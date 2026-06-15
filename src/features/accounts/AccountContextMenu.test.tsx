import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { AccountContextMenu } from './AccountContextMenu';
import { accountFixture, closedAccountFixture } from '@/test/fixtures';

describe('AccountContextMenu', () => {
  it('offers Edit for an open account and emits onRequestEdit', async () => {
    const user = userEvent.setup();
    const onRequestEdit = vi.fn();
    renderWithProviders(
      <AccountContextMenu
        account={accountFixture}
        onRequestEdit={onRequestEdit}
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      >
        <div>row</div>
      </AccountContextMenu>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('row') });
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));
    expect(onRequestEdit).toHaveBeenCalledWith(accountFixture);
  });

  it('offers Edit for a closed account too and emits onRequestEdit', async () => {
    const user = userEvent.setup();
    const onRequestEdit = vi.fn();
    renderWithProviders(
      <AccountContextMenu
        account={closedAccountFixture}
        onRequestEdit={onRequestEdit}
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      >
        <div>row</div>
      </AccountContextMenu>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('row') });
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));
    expect(onRequestEdit).toHaveBeenCalledWith(closedAccountFixture);
  });

  it('offers Close account for an open account and emits onRequestClose', async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();
    renderWithProviders(
      <AccountContextMenu
        account={accountFixture}
        onRequestEdit={vi.fn()}
        onRequestClose={onRequestClose}
        onRequestReopen={vi.fn()}
      >
        <div>row</div>
      </AccountContextMenu>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('row') });
    await user.click(await screen.findByRole('menuitem', { name: /^close$/i }));
    expect(onRequestClose).toHaveBeenCalledWith(accountFixture);
  });

  it('offers Reopen account for a closed account and emits onRequestReopen', async () => {
    const user = userEvent.setup();
    const onRequestReopen = vi.fn();
    renderWithProviders(
      <AccountContextMenu
        account={closedAccountFixture}
        onRequestEdit={vi.fn()}
        onRequestClose={vi.fn()}
        onRequestReopen={onRequestReopen}
      >
        <div>row</div>
      </AccountContextMenu>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('row') });
    await user.click(await screen.findByRole('menuitem', { name: /^reopen$/i }));
    expect(onRequestReopen).toHaveBeenCalledWith(closedAccountFixture);
  });
});
