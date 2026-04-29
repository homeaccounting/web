import { Link } from 'react-router-dom';
import { UserMenu } from './UserMenu';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <Link to="/" className="font-semibold">
        Home Accounting
      </Link>
      <UserMenu />
    </header>
  );
}
