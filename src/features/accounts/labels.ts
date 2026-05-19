import type { AccountSubtypeKind, AssetTypeKind, CardNetworkKind } from '@/api/types';

export const ACCOUNT_SUBTYPE_LABELS: Record<AccountSubtypeKind, string> = {
  cash: 'Cash',
  bankAccount: 'Bank account',
  eWallet: 'E-wallet',
  asset: 'Asset',
  loan: 'Loan',
};

export const CARD_NETWORK_LABELS: Record<CardNetworkKind, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
};

export const ASSET_TYPE_LABELS: Record<AssetTypeKind, string> = {
  property: 'Property',
  vehicle: 'Vehicle',
  stocks: 'Stocks',
  retirementFund: 'Retirement fund',
};
