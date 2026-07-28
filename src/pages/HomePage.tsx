import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AccountsPane } from '@/features/accounts/AccountsPane';
import { TransactionsPane } from '@/features/transactions/TransactionsPane';
import { useAccounts } from '@/features/accounts/useAccounts';
import { readLastView } from '@/features/transactions/lastView';
import { periodParamsToSearch } from '@/lib/period';

// Cold-start redirect: on bare `/` (no `:id`), once the accounts list has
// loaded, jump to the last-opened account (from the transactions "last view"
// persistence) and reconstruct its period into the URL so the transactions
// pane restores the date range via its URL-first precedence. Guards: only
// fires from `/` (never `/accounts/:id`, so it can't loop or hijack a
// deep link); waits for accounts.isSuccess; no-ops if there's no last view or
// the stored account was deleted (not in the current accounts list).
function useRestoreLastAccount() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const accounts = useAccounts();
  useEffect(() => {
    if (id || !accounts.isSuccess) return;
    const lv = readLastView();
    if (!lv || !accounts.data?.some((a) => a.id === lv.accountId)) return;
    const search = new URLSearchParams(
      periodParamsToSearch(lv.period, { from: lv.from ?? '', to: lv.to ?? '' }),
    ).toString();
    navigate(`/accounts/${lv.accountId}?${search}`, { replace: true });
  }, [id, accounts.isSuccess, accounts.data, navigate]);
}

export default function HomePage() {
  useRestoreLastAccount();
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="overflow-y-auto border-b md:w-72 md:shrink-0 md:border-b-0 md:border-r">
          <AccountsPane />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <TransactionsPane />
        </main>
      </div>
    </div>
  );
}
