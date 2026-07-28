import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DictionaryEntryResponse } from '@/api/types';
import { TransactionFilterBar } from './TransactionFilterBar';

const labels: DictionaryEntryResponse[] = [{ id: 'l1', name: 'Trip' }];
const categories: DictionaryEntryResponse[] = [{ id: 'c1', name: 'Food' }];
const contacts: DictionaryEntryResponse[] = [
  { id: 'ct1', name: 'Acme Corp' },
  { id: 'ct2', name: 'Bob Builder' },
];

function setup(overrides = {}) {
  const props = {
    filters: {
      description: '',
      labelIds: [],
      category: '',
      contactId: '',
      showCancelledFailed: false,
    },
    labelOptions: labels,
    categoryOptions: categories,
    contactOptions: contacts,
    onFiltersChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<TransactionFilterBar {...props} />);
  return props;
}

describe('TransactionFilterBar', () => {
  it('emits description changes', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText(/description/i), { target: { value: 'coffee' } });
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'coffee' }),
    );
  });
  it('fires onClear', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(props.onClear).toHaveBeenCalled();
  });
  it('clicking the cancelled & failed checkbox calls onFiltersChange with showCancelledFailed: true', () => {
    const props = setup();
    fireEvent.click(screen.getByLabelText(/cancelled & failed/i));
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ showCancelledFailed: true }),
    );
  });
  it('renders a contact select with an "Any contact" option plus the provided contacts', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('combobox', { name: /contact/i }));
    expect(screen.getByText('Any contact')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
  });
  it('picking a contact calls onFiltersChange with that contact id', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('combobox', { name: /contact/i }));
    await user.click(screen.getByText('Acme Corp'));
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'ct1' }),
    );
  });
});
