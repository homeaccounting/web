import type { AccountSubtypeType, AssetType, CardNetwork } from '@/api/types';

export const ACCOUNT_SUBTYPE_LABELS: Record<AccountSubtypeType, string> = {
  cash: 'Cash',
  bankAccount: 'Bank account',
  eWallet: 'E-wallet',
  asset: 'Asset',
  loan: 'Loan',
};

export const CARD_NETWORK_LABELS: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  property: 'Property',
  vehicle: 'Vehicle',
  stocks: 'Stocks',
  retirementFund: 'Retirement fund',
};
