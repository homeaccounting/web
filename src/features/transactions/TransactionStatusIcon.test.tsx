import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionStatusIcon } from './TransactionStatusIcon';

describe('TransactionStatusIcon', () => {
  it('renders nothing for Completed status', () => {
    const { container } = render(<TransactionStatusIcon status="Completed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a Failed icon with failureReason in the title', () => {
    render(<TransactionStatusIcon status="Failed" failureReason="Insufficient funds" />);
    const icon = screen.getByLabelText('Failed');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', 'Failed: Insufficient funds');
  });

  it('renders a Cancelled icon', () => {
    render(<TransactionStatusIcon status="Cancelled" />);
    expect(screen.getByLabelText('Cancelled')).toBeInTheDocument();
  });

  it('renders a Pending icon', () => {
    render(<TransactionStatusIcon status="Pending" />);
    expect(screen.getByLabelText('Pending')).toBeInTheDocument();
  });
});
