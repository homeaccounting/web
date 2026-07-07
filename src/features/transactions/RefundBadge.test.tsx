import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RefundBadge } from './RefundBadge';

describe('RefundBadge', () => {
  describe('origin mode', () => {
    it('renders a partial-refund label when the refunded total is below the original', () => {
      render(
        <RefundBadge
          mode="origin"
          refundStat={{ count: 1, total: 30 }}
          originalTotal={100}
          currency="USD"
        />,
      );
      expect(screen.getByText('partially refunded ($30.00 of $100.00)')).toBeInTheDocument();
    });

    it('renders "refunded in full" when the refunded total equals the original', () => {
      render(
        <RefundBadge
          mode="origin"
          refundStat={{ count: 1, total: 100 }}
          originalTotal={100}
          currency="USD"
        />,
      );
      expect(screen.getByText('refunded in full')).toBeInTheDocument();
    });

    it('treats a total within money-rounding of the original as full', () => {
      render(
        <RefundBadge
          mode="origin"
          refundStat={{ count: 1, total: 99.998 }}
          originalTotal={100}
          currency="USD"
        />,
      );
      expect(screen.getByText('refunded in full')).toBeInTheDocument();
    });
  });

  describe('refund mode', () => {
    it('renders "refund of <description>" when the original is resolved', () => {
      render(<RefundBadge mode="refund" originalDescription="Coffee" />);
      expect(screen.getByText('refund of Coffee')).toBeInTheDocument();
    });

    it('renders a generic "refund" when the original is not in the window', () => {
      render(<RefundBadge mode="refund" />);
      expect(screen.getByText('refund')).toBeInTheDocument();
    });
  });
});
