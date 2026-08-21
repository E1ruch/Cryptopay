'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useCreateOrganization, useOrganization } from '@/hooks/use-organization';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon';
import { icons } from '@/components/ui/icons';
import { ApiError } from '@/lib/api-client';

export default function DashboardOverviewPage() {
  const t = useTranslations('dashboard.overview');
  const { data: organization, isLoading, error } = useOrganization();

  return (
    <div>
      <h1 className="mb-6 animate-fade-up text-2xl font-semibold tracking-tight text-ink-900">
        {t('title')}
      </h1>

      {isLoading && <Skeleton className="h-40 max-w-md [animation-delay:80ms]" />}

      {error instanceof ApiError && error.status === 403 && <CreateOrganizationCard />}

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

function CreateOrganizationCard() {
  const t = useTranslations('dashboard.overview');
  const createOrganization = useCreateOrganization();
  const [name, setName] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createOrganization.mutateAsync(name.trim());
  }

  return (
    <Card className="max-w-md animate-fade-up [animation-delay:80ms]">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.85rem] bg-brand-50 text-brand-600">
          <Icon icon={icons.building} className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink-900">{t('createTitle')}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{t('createSubtitle')}</p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="org-name">{t('name')}</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            minLength={2}
            maxLength={120}
            required
          />
        </div>

        {createOrganization.error && (
          <p role="alert" className="rounded-control bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
            {createOrganization.error instanceof ApiError
              ? createOrganization.error.message
              : t('createTitle')}
          </p>
        )}

        <Button type="submit" disabled={createOrganization.isPending} className="w-full">
          {createOrganization.isPending ? t('creating') : t('create')}
        </Button>
      </form>
    </Card>
  );
}
