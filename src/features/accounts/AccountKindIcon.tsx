import {
  CircleHelp,
  Gem,
  HandCoins,
  Landmark,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AccountResponse, AccountSubtypeType } from '@/api/types';
import { cn } from '@/lib/utils';

const KIND_ICONS: Partial<Record<string, LucideIcon>> = {
  cash: Wallet,
  bankAccount: Landmark,
  eWallet: Smartphone,
  asset: Gem,
  loan: HandCoins,
} satisfies Record<AccountSubtypeType, LucideIcon>;

export function AccountKindIcon({
  account,
  className,
}: {
  account: AccountResponse;
  className?: string;
}) {
  const Icon = (account.subtype && KIND_ICONS[account.subtype.type]) ?? CircleHelp;
  return <Icon aria-hidden className={cn('h-4 w-4 shrink-0 text-muted-foreground', className)} />;
}
