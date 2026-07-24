import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>3</Badge>);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  it('applies the positive variant token class', () => {
    render(<Badge variant="positive">in</Badge>);
    expect(screen.getByText('in').className).toContain('text-positive');
  });
  it('is pill-shaped for the count variant', () => {
    render(<Badge variant="count">9</Badge>);
    expect(screen.getByText('9').className).toContain('rounded-full');
  });
});
