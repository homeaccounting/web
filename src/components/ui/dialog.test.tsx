import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogBody, DialogTitle } from './dialog';

it('renders a scrollable body region', () => {
  render(
    <Dialog open>
      <DialogContent size="lg">
        <DialogTitle>T</DialogTitle>
        <DialogBody>content</DialogBody>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByText('content').className).toContain('overflow-y-auto');
});
it('applies the lg width', () => {
  render(
    <Dialog open>
      <DialogContent size="lg">
        <DialogTitle>T</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByRole('dialog').className).toContain('max-w-2xl');
});
it('defaults to sm width (max-w-lg)', () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>T</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByRole('dialog').className).toContain('max-w-lg');
});
