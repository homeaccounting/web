import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/Header';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';

export default function NotFoundPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <PageContainer>
          <PageHeader title={t('notFound.title')} />
          <p className="text-sm text-muted-foreground">
            {t('notFound.body')}{' '}
            <Link to="/" className="underline">
              {t('notFound.goHome')}
            </Link>
            .
          </p>
        </PageContainer>
      </div>
    </div>
  );
}
