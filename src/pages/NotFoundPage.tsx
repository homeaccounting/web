import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';

export default function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <PageContainer>
          <PageHeader title="Page not found" />
          <p className="text-sm text-muted-foreground">
            The page you’re looking for doesn’t exist.{' '}
            <Link to="/" className="underline">
              Go back home
            </Link>
            .
          </p>
        </PageContainer>
      </div>
    </div>
  );
}
