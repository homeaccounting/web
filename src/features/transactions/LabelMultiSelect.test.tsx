import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelMultiSelect } from './LabelMultiSelect';
import type { DictionaryEntryResponse } from '@/api/types';

const TRIP = '00000000-0000-0000-0000-00000000071a';
const ROME = '00000000-0000-0000-0000-0000000000e0';

const options: DictionaryEntryResponse[] = [{ id: TRIP, name: 'Trip' }];

describe('LabelMultiSelect', () => {
  it('creating a label from the Create row appends its id and keeps the menu open', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(ROME);
    render(
      <LabelMultiSelect options={options} value={[TRIP]} onChange={onChange} onCreate={onCreate} />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, '  Rome ');
    await user.click(screen.getByRole('option', { name: /create.*Rome/i }));

    expect(onCreate).toHaveBeenCalledWith('Rome');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([TRIP, ROME]));
    expect(input).toHaveValue('');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('Enter on the Create row creates the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(ROME);
    render(
      <LabelMultiSelect options={options} value={[]} onChange={onChange} onCreate={onCreate} />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    // "Tri" substring-matches Trip, so the Create row sits after it.
    await user.type(input, 'Tri{ArrowDown}{Enter}');

    expect(onCreate).toHaveBeenCalledWith('Tri');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([ROME]));
  });

  it('hides the Create row when a label matches case-insensitively', async () => {
    const user = userEvent.setup();
    render(<LabelMultiSelect options={options} value={[]} onChange={vi.fn()} onCreate={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'trip');

    expect(screen.queryByText(/create/i)).not.toBeInTheDocument();
  });

  it('hides the Create row when onCreate is not passed', async () => {
    const user = userEvent.setup();
    render(<LabelMultiSelect options={options} value={[]} onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Rome');

    expect(screen.queryByText(/create/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it('keeps the typed name and reports the failure when the create fails', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(null);
    render(
      <LabelMultiSelect options={options} value={[]} onChange={onChange} onCreate={onCreate} />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Rome{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t create.*Rome/i);
    expect(input).toHaveValue('Rome');
    expect(onChange).not.toHaveBeenCalled();
  });
});
