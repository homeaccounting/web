import { Header } from '@/components/Header';
import { ReportsPane } from '@/features/reports/ReportsPane';

export default function ReportsPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <ReportsPane />
      </main>
    </div>
  );
}
