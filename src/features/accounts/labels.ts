import type { AccountSubtypeType, AssetType, CardNetwork } from '@/api/types';
import i18n from '@/lib/i18n';

// Localized display labels for account enums. These resolve against the
// `accounts` i18n namespace; the raw enum value is the fallback so a new
// backend value that isn't in the catalog yet still renders (forward-compat).
// Non-hook callers (format.ts, accountGroups.ts) use these directly; components
// re-render on language change via their own useTranslation subscription, so
// the current-language read here stays fresh.

export function accountSubtypeLabel(type: AccountSubtypeType): string {
  return i18n.t(`accounts:subtype.${type}`, { defaultValue: type });
}

export function cardNetworkLabel(network: CardNetwork): string {
  return i18n.t(`accounts:cardNetwork.${network}`, { defaultValue: network });
}

export function assetTypeLabel(type: AssetType): string {
  return i18n.t(`accounts:assetType.${type}`, { defaultValue: type });
}
