import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionActionBar, type SelectionActionBarProps } from './SelectionActionBar';

function setup(over: Partial<SelectionActionBarProps> = {}) {
  const props: SelectionActionBarProps = {
    count: 2,
    canLink: true,
    canMerge: true,
    onLink: vi.fn(),
    onMerge: vi.fn(),
    onClear: vi.fn(),
    ...over,
  };
  render(<SelectionActionBar {...props} />);
  return props;
}

describe('SelectionActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <SelectionActionBar
        count={0}
        canLink={false}
        canMerge={false}
        onLink={vi.fn()}
        onMerge={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count', () => {
    setup({ count: 3 });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('at count 1 shows a hint and no action buttons', () => {
    setup({ count: 1, canLink: false, canMerge: false });
    expect(screen.getByText(/select 2 to link or merge/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^merge/i })).not.toBeInTheDocument();
  });

  it('shows Link only when canLink', () => {
    setup({ count: 2, canLink: true });
    expect(screen.getByRole('button', { name: /link selected/i })).toBeInTheDocument();
  });

  it('hides Link when not canLink (e.g. 3 selected)', () => {
    setup({ count: 3, canLink: false });
    expect(screen.queryByRole('button', { name: /link selected/i })).not.toBeInTheDocument();
  });

  it('shows Merge enabled when canMerge', async () => {
    const user = userEvent.setup();
    const props = setup({ count: 2, canMerge: true });
    const merge = screen.getByRole('button', { name: /merge selected/i });
    expect(merge).toBeEnabled();
    await user.click(merge);
    expect(props.onMerge).toHaveBeenCalled();
  });

  it('shows Merge disabled with a reason when not canMerge', () => {
    setup({ count: 2, canMerge: false, mergeDisabledReason: 'All must be the same kind.' });
    expect(screen.getByRole('button', { name: /merge selected/i })).toBeDisabled();
  });

  it('fires onLink and onClear', async () => {
    const user = userEvent.setup();
    const props = setup({ count: 2, canLink: true });
    await user.click(screen.getByRole('button', { name: /link selected/i }));
    expect(props.onLink).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(props.onClear).toHaveBeenCalled();
  });
});
