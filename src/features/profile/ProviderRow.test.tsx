import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderRow } from './ProviderRow';

describe('ProviderRow', () => {
  it('shows Not linked + Link button when not linked', async () => {
    const onLink = vi.fn();
    render(
      <ProviderRow
        provider="Google"
        status={{ linked: false }}
        onLink={onLink}
        onUnlink={() => Promise.resolve()}
      />,
    );
    expect(screen.getByText('Not linked')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /link google/i }));
    expect(onLink).toHaveBeenCalled();
  });

  it('shows subtitle + Unlink dialog when linked', async () => {
    const onUnlink = vi.fn().mockResolvedValue(undefined);
    render(
      <ProviderRow
        provider="Google"
        status={{ linked: true, subtitle: 'alice@example.com' }}
        onLink={() => undefined}
        onUnlink={onUnlink}
      />,
    );
    expect(screen.getByText(/linked as alice@example.com/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /unlink/i }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    expect(onUnlink).toHaveBeenCalled();
  });

  it('disables Unlink with reason when disableUnlinkReason is set', () => {
    render(
      <ProviderRow
        provider="Telegram"
        status={{ linked: true, subtitle: '@alice' }}
        onLink={() => undefined}
        onUnlink={() => Promise.resolve()}
        disableUnlinkReason="You need at least one way to sign in."
      />,
    );
    const btn = screen.getByRole('button', { name: /unlink/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'You need at least one way to sign in.');
  });
});
