import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export const PAGE_SIZE_KEY = 'ha.transactions.pageSize';
export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export function usePersistedPageSize(): [number, (n: number) => void] {
  const [size, setSize] = useState<number>(() => {
    const raw = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(raw as (typeof PAGE_SIZES)[number]) ? raw : DEFAULT_PAGE_SIZE;
  });
  const update = (n: number) => {
    setSize(n);
    localStorage.setItem(PAGE_SIZE_KEY, String(n));
  };
  return [size, update];
}

export interface TransactionPaginationProps {
  total: number;
  pageIndex: number;
  pageSize: number;
  onPageIndexChange: (i: number) => void;
  onPageSizeChange: (n: number) => void;
}

export function TransactionPagination({
  total,
  pageIndex,
  pageSize,
  onPageIndexChange,
  onPageSizeChange,
}: TransactionPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(pageIndex, pageCount - 1);
  const start = total === 0 ? 0 : clamped * pageSize + 1;
  const end = Math.min(total, (clamped + 1) * pageSize);

  return (
    <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-3">
        {/* A plain <span>, not a <label>: the Select's own aria-label (not
        htmlFor/id, which Radix's Select.Root doesn't forward to the trigger)
        supplies the accessible name — see SelectTrigger below. */}
        <span className="flex items-center gap-1">
          Rows
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger aria-label="Rows per page" className="h-auto w-auto py-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={clamped <= 0}
          onClick={() => onPageIndexChange(clamped - 1)}
        >
          ‹ Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={clamped >= pageCount - 1}
          onClick={() => onPageIndexChange(clamped + 1)}
        >
          Next ›
        </Button>
      </div>
    </div>
  );
}
