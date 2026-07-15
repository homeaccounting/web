import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuSearchList } from './MenuSearchList';

const options = [
  { id: 'a', name: 'Groceries' },
  { id: 'b', name: 'Gas' },
  { id: 'c', name: 'Rent' },
];

describe('MenuSearchList', () => {
  it('filters options by case-insensitive substring', async () => {
    const user = userEvent.setup();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="Search categories…"
      />,
    );
    await user.type(screen.getByRole('combobox', { name: /search categories/i }), 'g');
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gas' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rent' })).not.toBeInTheDocument();
  });

  it('marks selected options with aria-selected', () => {
    render(
      <MenuSearchList
        options={options}
        isSelected={(id) => id === 'b'}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    expect(screen.getByRole('option', { name: 'Gas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Rent' })).toHaveAttribute('aria-selected', 'false');
  });

  it('picks the clicked option', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={onPick}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    await user.click(screen.getByRole('option', { name: 'Rent' }));
    expect(onPick).toHaveBeenCalledWith('c');
  });

  it('navigates with arrows and commits the active option on Enter', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={onPick}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    const input = screen.getByRole('combobox', { name: /search categories/i });
    input.focus();
    await user.keyboard('{ArrowDown}{Enter}'); // active 0 -> 1 -> pick 'b'
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('renders a No matches row when the filter excludes everything', async () => {
    const user = userEvent.setup();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    await user.type(screen.getByRole('combobox', { name: /search categories/i }), 'zzz');
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it('renders the empty state for an empty option list', () => {
    render(
      <MenuSearchList
        options={[]}
        isSelected={() => false}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});
