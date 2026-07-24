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

  describe('onCreate', () => {
    it('shows a Create row for a non-matching query and calls onCreate on activation', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      render(
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={() => {}}
          onCreate={onCreate}
          searchAriaLabel="Search contacts"
          placeholder="…"
        />,
      );
      await user.type(screen.getByRole('combobox', { name: /search contacts/i }), 'Acme Corp');
      const createRow = screen.getByRole('option', { name: /create ['‘]Acme Corp['’]/i });
      expect(createRow).toBeInTheDocument();
      await user.click(createRow);
      expect(onCreate).toHaveBeenCalledWith('Acme Corp');
    });

    it('does not show a Create row when the query matches an option case-insensitively', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      render(
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={() => {}}
          onCreate={onCreate}
          searchAriaLabel="Search contacts"
          placeholder="…"
        />,
      );
      await user.type(screen.getByRole('combobox', { name: /search contacts/i }), 'groceries');
      expect(screen.queryByRole('option', { name: /create /i })).not.toBeInTheDocument();
    });

    it('never renders a Create row when onCreate is not provided', async () => {
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
      await user.type(screen.getByRole('combobox', { name: /search categories/i }), 'Acme Corp');
      expect(screen.queryByRole('option', { name: /create /i })).not.toBeInTheDocument();
    });

    it('activates the Create row with keyboard when it is the last active item', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      render(
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={() => {}}
          onCreate={onCreate}
          searchAriaLabel="Search contacts"
          placeholder="…"
        />,
      );
      const input = screen.getByRole('combobox', { name: /search contacts/i });
      input.focus();
      await user.type(input, 'Acme Corp'); // no option matches -> only the Create row
      await user.keyboard('{Enter}'); // active 0 is the Create row
      expect(onCreate).toHaveBeenCalledWith('Acme Corp');
    });
  });

  describe('createHint', () => {
    it('fills the box with the normalized hint on activation', async () => {
      const user = userEvent.setup();
      render(
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={() => {}}
          createHint="  SILPO   123  KYIV "
          searchAriaLabel="Search contacts"
          placeholder="…"
        />,
      );
      const input = screen.getByRole('combobox', { name: /search contacts/i });
      expect(input).toHaveValue('');
      const useButton = screen.getByRole('button', { name: /use: SILPO 123 KYIV/i });
      expect(useButton).toBeInTheDocument();
      await user.click(useButton);
      expect(input).toHaveValue('SILPO 123 KYIV');
    });

    it('does not render the Use affordance for a blank hint', () => {
      render(
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={() => {}}
          createHint="   "
          searchAriaLabel="Search contacts"
          placeholder="…"
        />,
      );
      expect(screen.queryByRole('button', { name: /use:/i })).not.toBeInTheDocument();
    });
  });
});
