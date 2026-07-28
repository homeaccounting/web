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
        presets={['this-month', 'last-month', 'this-year', 'all-time']}
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
        presets={['this-month', 'last-month', 'this-year', 'all-time']}
        onPresetChange={vi.fn()}
        onRangeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('renders only the presets passed in, plus Custom', async () => {
    const user = userEvent.setup();
    render(
      <PeriodSelector
        presets={['this-month', 'last-year']}
        value="this-month"
        range={{ from: '', to: '' }}
        onPresetChange={() => {}}
        onRangeChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: /period/i }));
    expect(screen.getByRole('option', { name: 'This month' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last year' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Last month' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /custom/i })).toBeInTheDocument();
  });
});
