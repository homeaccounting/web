import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BrandLogo } from './BrandLogo';
import { UserMenu } from './UserMenu';

// Top-level areas, shown as peer nav tabs. The default area ("Accounts") covers
// the accounts + transactions screen, which also lives under /accounts/:id, so
// its active match is broader than an exact path.
const NAV_TABS: { to: string; label: string; isActive: (pathname: string) => boolean }[] = [
  { to: '/', label: 'Accounts', isActive: (p) => p === '/' || p.startsWith('/accounts') },
  { to: '/reports', label: 'Reports', isActive: (p) => p.startsWith('/reports') },
];

export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center">
          <BrandLogo className="h-10" />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {NAV_TABS.map((tab) => {
            const active = tab.isActive(pathname);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border-b-2 pb-0.5 transition-colors',
                  active
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <UserMenu />
    </header>
  );
}
