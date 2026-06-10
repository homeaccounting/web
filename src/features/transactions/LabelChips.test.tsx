import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LabelChips } from './LabelChips';

const names = new Map([
  ['l1', 'Trip'],
  ['l2', 'Food'],
]);

describe('LabelChips', () => {
  it('renders a chip per known label id', () => {
    render(<LabelChips labelIds={['l1', 'l2']} nameById={names} />);
    expect(screen.getByText('Trip')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
  });
  it('skips unknown ids and renders nothing when empty', () => {
    const { container } = render(<LabelChips labelIds={['nope']} nameById={names} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('applies a leading gap (ml-2) by default to separate from preceding text', () => {
    const { container } = render(<LabelChips labelIds={['l1']} nameById={names} />);
    expect(container.firstElementChild?.className).toContain('ml-2');
  });
  it('omits the leading gap when leadingGap is false (e.g. empty description)', () => {
    const { container } = render(
      <LabelChips labelIds={['l1']} nameById={names} leadingGap={false} />,
    );
    expect(container.firstElementChild?.className).not.toContain('ml-2');
  });
});
