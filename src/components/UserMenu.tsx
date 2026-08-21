import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  const { session, signOut } = useAuth();
  const { data: profile } = useUserProfile();
  const initials = (profile?.email ?? session?.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={t('userMenu.open')} className="rounded-full p-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {profile?.email ?? session?.email ?? t('userMenu.accountFallback')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">{t('userMenu.profile')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>{t('userMenu.signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
