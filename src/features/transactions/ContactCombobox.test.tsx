import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactCombobox } from './ContactCombobox';
import type { DictionaryEntryResponse } from '@/api/types';

const ACME = '00000000-0000-0000-0000-0000000ac3e0';
const BOB = '00000000-0000-0000-0000-0000000000b0';

const options: DictionaryEntryResponse[] = [
  { id: ACME, name: 'Acme Corp' },
  { id: BOB, name: 'Bob Builder' },
];

describe('ContactCombobox', () => {
  it("renders the selected contact's name when value matches an option", () => {
    render(
      <ContactCombobox options={options} value={ACME} onChange={vi.fn()} aria-label="Contact" />,
    );

    expect(screen.getByRole('combobox', { name: /contact/i })).toHaveValue('Acme Corp');
  });

  it('picking the "— none —" row calls onChange(null)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContactCombobox options={options} value={ACME} onChange={onChange} aria-label="Contact" />,
    );

    await user.click(screen.getByRole('combobox', { name: /contact/i }));
    await user.click(screen.getByText(/—\s*none\s*—/i));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('typing a substring filters; picking a filtered option calls onChange(id)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContactCombobox options={options} value={null} onChange={onChange} aria-label="Contact" />,
    );

    const input = screen.getByRole('combobox', { name: /contact/i });
    await user.click(input);
    await user.type(input, 'bob');

    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    await user.click(screen.getByText('Bob Builder'));

    expect(onChange).toHaveBeenCalledWith(BOB);
  });

  it('shows Create row for a non-matching query and activating it calls onCreate (not onChange)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCreate = vi.fn();
    render(
      <ContactCombobox
        options={options}
        value={null}
        onChange={onChange}
        onCreate={onCreate}
        aria-label="Contact"
      />,
    );

    const input = screen.getByRole('combobox', { name: /contact/i });
    await user.click(input);
    await user.type(input, 'Carol');

    const createRow = screen.getByText(/create.*Carol/i);
    expect(createRow).toBeInTheDocument();

    await user.click(createRow);

    expect(onCreate).toHaveBeenCalledWith('Carol');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hides the Create row when a case-insensitive match exists', async () => {
    const user = userEvent.setup();
    render(
      <ContactCombobox
        options={options}
        value={null}
        onChange={vi.fn()}
        onCreate={vi.fn()}
        aria-label="Contact"
      />,
    );

    const input = screen.getByRole('combobox', { name: /contact/i });
    await user.click(input);
    await user.type(input, 'acme corp');

    expect(screen.queryByText(/create/i)).not.toBeInTheDocument();
  });

  it('hides the Create row when onCreate is not passed', async () => {
    const user = userEvent.setup();
    render(
      <ContactCombobox options={options} value={null} onChange={vi.fn()} aria-label="Contact" />,
    );

    const input = screen.getByRole('combobox', { name: /contact/i });
    await user.click(input);
    await user.type(input, 'Carol');

    expect(screen.queryByText(/create/i)).not.toBeInTheDocument();
  });
});
