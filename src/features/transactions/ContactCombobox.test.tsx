import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactCombobox } from './ContactCombobox';
import type { DictionaryEntryResponse } from '@/api/types';

const ACME = '00000000-0000-0000-0000-0000000ac3e0';
const BOB = '00000000-0000-0000-0000-0000000000b0';
const CAROL = '00000000-0000-0000-0000-0000000ca201';

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

  it('shows Create row for a non-matching query and activating it selects the created contact', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(CAROL);
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
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(CAROL));
  });

  it('clears the input while the create is in flight', async () => {
    const user = userEvent.setup();
    let resolve: (id: string | null) => void = () => {};
    const onCreate = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
    const onChange = vi.fn();
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
    await user.click(screen.getByText(/create.*Carol/i));

    // Callers wait for the created contact's name to show before saving, so the
    // typed text must not linger and pass for it.
    expect(input).toHaveValue('');
    resolve(CAROL);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(CAROL));
  });

  it('keeps the typed name and reports the failure when the create fails', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContactCombobox
        options={options}
        value={null}
        onChange={onChange}
        onCreate={vi.fn().mockResolvedValue(null)}
        aria-label="Contact"
      />,
    );

    const input = screen.getByRole('combobox', { name: /contact/i });
    await user.click(input);
    await user.type(input, 'Carol');
    await user.click(screen.getByText(/create.*Carol/i));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t create.*Carol/i);
    expect(input).toHaveValue('Carol');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers the create hint as the search text', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(CAROL);
    render(
      <ContactCombobox
        options={options}
        value={null}
        onChange={vi.fn()}
        onCreate={onCreate}
        createHint="  Carol   Café "
        aria-label="Contact"
      />,
    );

    const input = screen.getByRole('combobox', { name: /contact/i });
    await user.click(input);
    await user.click(screen.getByRole('button', { name: /use: Carol Café/i }));

    expect(input).toHaveValue('Carol Café');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onCreate).toHaveBeenCalledWith('Carol Café');
  });

  it('hides the create hint without onCreate', async () => {
    const user = userEvent.setup();
    render(
      <ContactCombobox
        options={options}
        value={null}
        onChange={vi.fn()}
        createHint="Carol"
        aria-label="Contact"
      />,
    );

    await user.click(screen.getByRole('combobox', { name: /contact/i }));

    expect(screen.queryByRole('button', { name: /use:/i })).not.toBeInTheDocument();
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
