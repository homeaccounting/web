import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

it('renders the title as a level-1 heading', () => {
  render(<PageHeader title="Reports" />);
  const h = screen.getByRole('heading', { level: 1, name: 'Reports' });
  expect(h.className).toContain('text-2xl');
});
it('renders actions', () => {
  render(<PageHeader title="Reports" actions={<button>New</button>} />);
  expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
});
