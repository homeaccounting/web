import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodSelector } from './PeriodSelector';

describe('PeriodSelector', () => {
  it('shows the active preset and emits onPresetChange', async () => {
    const onPreset = vi.fn();
    render(
      <PeriodSelector
        value="this-month"
        range={{ from: '2026-06-01', to: '2026-06-30' }}
        onPresetChange={onPreset}
        onRangeChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: /period/i }));
    // Radix portals the listbox asynchronously — use findByRole.
    await userEvent.click(await screen.findByRole('option', { name: 'Last month' }));
    expect(onPreset).toHaveBeenCalledWith('last-month');
  });

  it('reveals custom date inputs when Custom is selected', () => {
    render(
      <PeriodSelector
        value="custom"
        range={{ from: '2026-06-01', to: '2026-06-30' }}
        onPresetChange={vi.fn()}
        onRangeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });
});
