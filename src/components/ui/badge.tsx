import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center font-medium text-xs whitespace-nowrap', {
  variants: {
    variant: {
      default: 'rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground',
      muted: 'rounded-md bg-muted px-2 py-0.5 text-muted-foreground',
      outline: 'rounded-md border px-2 py-0.5',
      positive: 'rounded-md bg-positive/10 px-2 py-0.5 text-positive',
      negative: 'rounded-md bg-negative/10 px-2 py-0.5 text-negative',
      count: 'rounded-full bg-primary px-1.5 text-primary-foreground',
      status: 'rounded-full bg-muted px-2 py-0.5 text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { badgeVariants };
