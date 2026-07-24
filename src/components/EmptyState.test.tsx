import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

it('renders the message', () => {
  render(<EmptyState message="No accounts yet." />);
  expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
});
it('renders an optional action', () => {
  render(<EmptyState message="No accounts yet." action={<button>Add</button>} />);
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});
