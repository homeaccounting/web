import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Standard app content page: consistent padding + max width. Scrolls within its
// parent (pages own the flex column + Header).
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mx-auto w-full max-w-4xl p-4 md:p-6', className)}>{children}</div>;
}
