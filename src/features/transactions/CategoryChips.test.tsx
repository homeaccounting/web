import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryChips } from './CategoryChips';

const names = new Map([
  ['c1', 'Salary'],
  ['c2', 'Food'],
]);

describe('CategoryChips', () => {
  it('renders a chip per known category id', () => {
    render(<CategoryChips categoryIds={['c1', 'c2']} nameById={names} />);
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
  });
  it('renders the resolved name, not the raw id', () => {
    render(<CategoryChips categoryIds={['c1']} nameById={names} />);
    expect(screen.queryByText('c1')).not.toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
  });
  it('skips unknown ids and renders nothing when none are known', () => {
    const { container } = render(<CategoryChips categoryIds={['nope']} nameById={names} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('renders a chip per slice even when a category id repeats', () => {
    render(<CategoryChips categoryIds={['c2', 'c2']} nameById={names} />);
    expect(screen.getAllByText('Food')).toHaveLength(2);
  });

  it('shows the leaf name in the chip but the full path in the tooltip', () => {
    const nested = new Map([
      ['g', 'Food / Groceries'],
      ['t', 'Transport'],
    ]);
    render(<CategoryChips categoryIds={['g', 't']} nameById={nested} />);
    // Chip text is the leaf, so a fixed-width column stays compact.
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Food / Groceries')).not.toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    // The full paths remain available on hover.
    expect(screen.getByTitle('Food / Groceries, Transport')).toBeInTheDocument();
  });
});
