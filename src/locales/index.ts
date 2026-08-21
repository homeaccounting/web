import enCommon from './en/common.json';
import ukCommon from './uk/common.json';
import enAccounts from './en/accounts.json';
import ukAccounts from './uk/accounts.json';
import enTransactions from './en/transactions.json';
import ukTransactions from './uk/transactions.json';
import enProfile from './en/profile.json';
import ukProfile from './uk/profile.json';
import enBanking from './en/banking.json';
import ukBanking from './uk/banking.json';
import enOnboarding from './en/onboarding.json';
import ukOnboarding from './uk/onboarding.json';
import enReports from './en/reports.json';
import ukReports from './uk/reports.json';
import enPages from './en/pages.json';
import ukPages from './uk/pages.json';

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// One entry per namespace; extend as extraction tasks add namespaces.
export const resources = {
  en: {
    common: enCommon,
    accounts: enAccounts,
    transactions: enTransactions,
    profile: enProfile,
    banking: enBanking,
    onboarding: enOnboarding,
    reports: enReports,
    pages: enPages,
  },
  uk: {
    common: ukCommon,
    accounts: ukAccounts,
    transactions: ukTransactions,
    profile: ukProfile,
    banking: ukBanking,
    onboarding: ukOnboarding,
    reports: ukReports,
    pages: ukPages,
  },
} as const;

// Derived from `resources` so the namespace list cannot drift from the actual
// catalogs as extraction tasks add namespaces.
export const NAMESPACES = Object.keys(resources.en) as (keyof typeof resources.en)[];
export const DEFAULT_NAMESPACE = 'common';
