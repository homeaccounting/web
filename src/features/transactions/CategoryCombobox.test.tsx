import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryCombobox } from './CategoryCombobox';
import type { DictionaryEntryResponse } from '@/api/types';

const options: DictionaryEntryResponse[] = [
  { id: '00000000-0000-0000-0000-00000000f00d', name: 'Food' },
];

describe('CategoryCombobox archived fallback', () => {
  it('renders a read-only label (no editable combobox) when the value is not among the options', () => {
    const archivedId = '00000000-0000-0000-0000-00000000dead';
    render(
      <CategoryCombobox
        options={options}
        value={archivedId}
        onChange={vi.fn()}
        aria-label="Category"
      />,
    );

    // No editable trigger for an archived category.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // The archived value renders as static, read-only text with a human-readable label.
    expect(screen.getByText(/archived/i)).toBeInTheDocument();
    // The raw UUID must NOT appear in the label — users should see a clean label only.
    expect(screen.queryByText(archivedId)).not.toBeInTheDocument();
  });

  it('renders the editable combobox when the value matches an option', () => {
    render(
      <CategoryCombobox
        options={options}
        value="00000000-0000-0000-0000-00000000f00d"
        onChange={vi.fn()}
        aria-label="Category"
      />,
    );

    expect(screen.getByRole('combobox', { name: /category/i })).toBeInTheDocument();
  });

  it('renders the editable combobox for an empty value (new blank row)', () => {
    render(
      <CategoryCombobox options={options} value="" onChange={vi.fn()} aria-label="Category" />,
    );

    expect(screen.getByRole('combobox', { name: /category/i })).toBeInTheDocument();
  });
});
