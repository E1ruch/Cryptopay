'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useInvoices, type InvoiceListItem } from '@/hooks/use-invoices';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyIcon } from '@/components/ui/icons';

export default function InvoicesPage() {
  const t = useTranslations('dashboard.invoices');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useInvoices(page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <h1 className="mb-6 animate-fade-up text-2xl font-semibold tracking-tight text-ink-900">{t('title')}</h1>

      {isLoading && !data && <Skeleton className="h-40" />}

      {data && data.data.length === 0 && (
        <Card className="animate-fade-up">
          <p className="text-sm text-ink-500">{t('empty')}</p>
        </Card>
      )}

      {data && data.data.length > 0 && (
        <>
          <Card className="animate-fade-up overflow-hidden !p-0">
            <div className="divide-y divide-ink-100">
              {data.data.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('previous')}
              </Button>
              <span className="text-sm text-ink-500">{t('pageOf', { page, totalPages })}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceListItem }) {
  const t = useTranslations('dashboard.invoices');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="font-mono text-sm text-ink-800">{invoice.id}</p>
        <p className="mt-0.5 text-xs text-ink-400">{new Date(invoice.createdAt).toLocaleString()}</p>
      </div>

      <div className="flex items-center gap-3">
        <p className="tabular-nums text-sm font-semibold text-ink-900">
          {invoice.amount} {invoice.token}
        </p>
        <Badge tone={toneForStatus(invoice.status)}>{t(`status_${invoice.status}`)}</Badge>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(invoice.checkoutUrl).then(() => setCopied(true));
          }}
          className="flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
        >
          <CopyIcon className="h-3.5 w-3.5" />
          {copied ? t('copied') : t('copyLink')}
        </button>
      </div>
    </div>
  );
}
