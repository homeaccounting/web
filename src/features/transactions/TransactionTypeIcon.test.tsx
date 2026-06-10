import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionTypeIcon } from './TransactionTypeIcon';

describe('TransactionTypeIcon', () => {
  it('exposes the type as an accessible label', () => {
    render(<TransactionTypeIcon type="income" />);
    expect(screen.getByLabelText('Income')).toBeInTheDocument();
  });
  it('renders a fallback for unknown types', () => {
    render(<TransactionTypeIcon type="weird" />);
    expect(screen.getByLabelText('weird')).toBeInTheDocument();
  });
});
