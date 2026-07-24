import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </div>
  );
}
