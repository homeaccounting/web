import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DictionaryEntryResponse } from '@/api/types';
import { TransactionFilterBar } from './TransactionFilterBar';

const labels: DictionaryEntryResponse[] = [{ id: 'l1', name: 'Trip' }];
const categories: DictionaryEntryResponse[] = [{ id: 'c1', name: 'Food' }];

function setup(overrides = {}) {
  const props = {
    from: '2026-05-10',
    to: '2026-06-10',
    filters: { description: '', labelIds: [], categoryId: '', showCancelledFailed: false },
    labelOptions: labels,
    categoryOptions: categories,
    onFromChange: vi.fn(),
    onToChange: vi.fn(),
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
  it('renders From and To as date-picker trigger buttons', () => {
    setup();
    expect(screen.getByLabelText('From')).toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByLabelText('To')).toBeInstanceOf(HTMLButtonElement);
  });
  it('opens a calendar when the From trigger is clicked', () => {
    setup();
    fireEvent.click(screen.getByLabelText('From'));
    expect(screen.getByRole('grid')).toBeInTheDocument();
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
});
