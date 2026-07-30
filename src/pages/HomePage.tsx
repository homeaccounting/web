import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AccountsPane } from '@/features/accounts/AccountsPane';
import { TransactionsPane } from '@/features/transactions/TransactionsPane';
import { useAccounts } from '@/features/accounts/useAccounts';
import { readLastView } from '@/features/transactions/lastView';
import { periodParamsToSearch } from '@/lib/period';
import { scopeToParam } from '@/features/transactions/accountScope';

// Cold-start: on bare `/`, once accounts have loaded, redirect to the canonical
// `/transactions` route, reconstructing the persisted account scope + period so
// the pane restores its view. Only fires from `/` (never `/transactions` or a
// deep link). All-scope (or no last view) → `/transactions` with just the
// period; a subset → `?accounts=…`, dropping ids no longer present.
function useRestoreLastView() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const accounts = useAccounts();
  useEffect(() => {
    if (pathname !== '/' || !accounts.isSuccess) return;
    const lv = readLastView();
    const search = new URLSearchParams(
      lv ? periodParamsToSearch(lv.period, { from: lv.from ?? '', to: lv.to ?? '' }) : '',
    );
    if (lv) {
      const known = new Set(accounts.data?.map((a) => a.id));
      const ids = lv.accounts === 'all' ? [] : lv.accounts.filter((id) => known.has(id));
      const param = scopeToParam(ids.length ? { kind: 'accounts', ids } : { kind: 'all' });
      if (param) search.set('accounts', param);
    }
    const qs = search.toString();
    navigate(`/transactions${qs ? `?${qs}` : ''}`, { replace: true });
  }, [pathname, accounts.isSuccess, accounts.data, navigate]);
}

export default function HomePage() {
  useRestoreLastView();
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
