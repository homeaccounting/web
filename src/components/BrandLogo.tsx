import logoUrl from '@/assets/logo.png';
import { cn } from '@/lib/utils';

// Shared brand mark. Single source of the logo asset + accessible name so the
// header, auth pages, and anywhere else stay in sync. Size is set by the caller
// via `className` (e.g. "h-10").
export function BrandLogo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="Home Accounting" className={cn('w-auto', className)} />;
}
