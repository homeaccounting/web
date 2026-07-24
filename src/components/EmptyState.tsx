import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ message, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 p-6 text-center', className)}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
