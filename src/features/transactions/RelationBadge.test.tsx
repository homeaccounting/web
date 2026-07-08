import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RelationBadge } from './RelationBadge';

describe('RelationBadge', () => {
  describe('refund origin mode', () => {
    it('renders a partial-refund label when the refunded total is below the original', () => {
      render(
        <RelationBadge
          kind="refund"
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
        <RelationBadge
          kind="refund"
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
        <RelationBadge
          kind="refund"
          mode="origin"
          refundStat={{ count: 1, total: 99.998 }}
          originalTotal={100}
          currency="USD"
        />,
      );
      expect(screen.getByText('refunded in full')).toBeInTheDocument();
    });
  });

  describe('refund counterpart mode', () => {
    it('renders "refund of <description>" when the original is resolved', () => {
      render(<RelationBadge kind="refund" mode="counterpart" description="Coffee" />);
      expect(screen.getByText('refund of Coffee')).toBeInTheDocument();
    });

    it('renders a generic "refund" when the original is not in the window', () => {
      render(<RelationBadge kind="refund" mode="counterpart" />);
      expect(screen.getByText('refund')).toBeInTheDocument();
    });
  });

  describe('associated mode', () => {
    it('renders "associated with <description>"', () => {
      render(<RelationBadge kind="associated" mode="counterpart" description="Invoice #7" />);
      expect(screen.getByText('associated with Invoice #7')).toBeInTheDocument();
    });

    it('renders a generic "associated" when the counterpart is not in the window', () => {
      render(<RelationBadge kind="associated" mode="counterpart" />);
      expect(screen.getByText('associated')).toBeInTheDocument();
    });

    it('appends "(cancelled)" when the counterpart is cancelled', () => {
      render(
        <RelationBadge
          kind="associated"
          mode="counterpart"
          description="Invoice #7"
          counterpartCancelled
        />,
      );
      const el = screen.getByText(/associated with Invoice #7/);
      expect(el).toHaveTextContent('associated with Invoice #7 (cancelled)');
    });
  });

  describe('unlink affordance', () => {
    it('renders an unlink control and calls onUnlink once when clicked (refund)', () => {
      const onUnlink = vi.fn();
      render(
        <RelationBadge kind="refund" mode="counterpart" description="Coffee" onUnlink={onUnlink} />,
      );
      const btn = screen.getByRole('button', { name: 'Unlink' });
      fireEvent.click(btn);
      expect(onUnlink).toHaveBeenCalledTimes(1);
    });

    it('renders an unlink control for associated relations', () => {
      const onUnlink = vi.fn();
      render(
        <RelationBadge
          kind="associated"
          mode="counterpart"
          description="Invoice #7"
          onUnlink={onUnlink}
        />,
      );
      const btn = screen.getByRole('button', { name: 'Unlink' });
      fireEvent.click(btn);
      expect(onUnlink).toHaveBeenCalledTimes(1);
    });

    it('renders no unlink control when onUnlink is omitted', () => {
      render(<RelationBadge kind="refund" mode="counterpart" description="Coffee" />);
      expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument();
    });
  });
});
