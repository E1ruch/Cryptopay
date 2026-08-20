'use client';

import { useTranslations } from 'next-intl';
import { useOrganization } from '@/hooks/use-organization';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { ApiError } from '@/lib/api-client';

export default function DashboardOverviewPage() {
  const t = useTranslations('dashboard.overview');
  const { data: organization, isLoading, error } = useOrganization();

  return (
    <div>
      <h1 className="mb-6 animate-fade-up text-2xl font-semibold tracking-tight text-ink-900">
        {t('title')}
      </h1>

      {isLoading && (
        <div className="h-40 max-w-md animate-pulse rounded-card bg-ink-100 [animation-delay:80ms]" />
      )}

      {error instanceof ApiError && error.status === 403 && (
        <Card className="max-w-md animate-fade-up [animation-delay:80ms]">
          <p className="text-sm text-ink-500">{t('noOrganization')}</p>
        </Card>
      )}

      {organization && (
        <StatCard
          className="max-w-md animate-scale-in [animation-delay:80ms]"
          eyebrow={t('organization')}
          value={organization.name}
          footer={t('welcome')}
        />
      )}
    </div>
  );
}
