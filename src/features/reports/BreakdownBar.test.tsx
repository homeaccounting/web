import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreakdownBar } from './BreakdownBar';

describe('BreakdownBar', () => {
  it('renders label, amount, and a proportional bar width', () => {
    render(<BreakdownBar label="Food" amount="$120.00" fraction={0.5} />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    const bar = screen.getByTestId('breakdown-bar-fill');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('clamps fraction into [0,1]', () => {
    render(<BreakdownBar label="X" amount="$1" fraction={2} />);
    expect(screen.getByTestId('breakdown-bar-fill')).toHaveStyle({ width: '100%' });
  });
});
