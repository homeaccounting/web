import { Header } from '@/components/Header';
import { AccountsPane } from '@/features/accounts/AccountsPane';
import { TransactionsPane } from '@/features/transactions/TransactionsPane';

export default function HomePage() {
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
