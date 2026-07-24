import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactChip } from './ContactChip';

const names = new Map([
  ['c1', 'Amazon'],
  ['c2', 'Retail / Local Store'],
]);

describe('ContactChip', () => {
  it('renders a plain (non-nested) contact name', () => {
    render(<ContactChip contactId="c1" nameById={names} />);
    expect(screen.getByText('Amazon')).toBeInTheDocument();
  });

  it('shows the leaf name in the chip but the full path in the tooltip', () => {
    render(<ContactChip contactId="c2" nameById={names} />);
    // Chip text is the leaf, so it stays compact next to the label chips.
    expect(screen.getByText('Local Store')).toBeInTheDocument();
    expect(screen.queryByText('Retail / Local Store')).not.toBeInTheDocument();
    // The full path remains available on hover.
    expect(screen.getByTitle('Retail / Local Store')).toBeInTheDocument();
  });

  it('renders nothing when the contactId is null', () => {
    const { container } = render(<ContactChip contactId={null} nameById={names} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the contactId is not in the map', () => {
    const { container } = render(<ContactChip contactId="nope" nameById={names} />);
    expect(container).toBeEmptyDOMElement();
  });
});
