import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import {
  TransactionPagination,
  usePersistedPageSize,
  PAGE_SIZE_KEY,
} from './TransactionPagination';

describe('usePersistedPageSize', () => {
  beforeEach(() => localStorage.clear());
  it('defaults to 50 and persists changes', () => {
    const { result } = renderHook(() => usePersistedPageSize());
    expect(result.current[0]).toBe(50);
    act(() => result.current[1](100));
    expect(localStorage.getItem(PAGE_SIZE_KEY)).toBe('100');
  });
  it('reads a persisted value', () => {
    localStorage.setItem(PAGE_SIZE_KEY, '25');
    const { result } = renderHook(() => usePersistedPageSize());
    expect(result.current[0]).toBe(25);
  });
});

describe('TransactionPagination', () => {
  const props = {
    total: 123,
    pageIndex: 0,
    pageSize: 50,
    onPageIndexChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  };
  it('shows the N–M of T range', () => {
    render(<TransactionPagination {...props} />);
    expect(screen.getByText(/1–50 of 123/)).toBeInTheDocument();
  });
  it('disables Prev on the first page and advances on Next', () => {
    const onPageIndexChange = vi.fn();
    render(<TransactionPagination {...props} onPageIndexChange={onPageIndexChange} />);
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageIndexChange).toHaveBeenCalledWith(1);
  });
  it('disables Next on the last page', () => {
    render(<TransactionPagination {...props} pageIndex={2} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
