import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/useAuth';
import { useUserProfile } from '@/features/profile/useUserProfile';

export function UserMenu() {
  const { session, signOut } = useAuth();
  const { data: profile } = useUserProfile();
  const initials = (profile?.email ?? session?.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label="Open user menu" className="rounded-full p-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{profile?.email ?? session?.email ?? 'Account'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
