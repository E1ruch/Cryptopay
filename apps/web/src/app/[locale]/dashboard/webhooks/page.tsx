'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  useCreateWebhookEndpoint,
  useRevokeWebhookEndpoint,
  useWebhookDeliveries,
  useWebhookEndpoints,
  type WebhookEndpointView,
} from '@/hooks/use-webhook-endpoints';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CopyIcon, WebhookIcon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api-client';

export default function WebhooksPage() {
  const t = useTranslations('dashboard.webhooks');
  const { data: endpoints, isLoading } = useWebhookEndpoints();
  const [formOpen, setFormOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6 flex animate-fade-up items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t('title')}</h1>
        {!formOpen && !createdSecret && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t('addEndpoint')}
          </Button>
        )}
      </div>

      {createdSecret && <CreatedSecretBanner secret={createdSecret} onDone={() => setCreatedSecret(null)} />}

      {formOpen && !createdSecret && (
        <CreateEndpointForm
          onCancel={() => setFormOpen(false)}
          onCreated={(secret) => {
            setFormOpen(false);
            setCreatedSecret(secret);
          }}
        />
      )}

      {isLoading && !endpoints && <div className="mt-4 h-40 animate-pulse rounded-card bg-ink-100" />}

      {endpoints && endpoints.length === 0 && !formOpen && (
        <Card className="mt-4 animate-fade-up">
          <p className="text-sm text-ink-500">{t('empty')}</p>
        </Card>
      )}

      {endpoints && endpoints.length > 0 && (
        <Card className="mt-4 animate-fade-up overflow-hidden !p-0">
          <div className="divide-y divide-ink-100">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id}>
                <EndpointRow
                  endpoint={endpoint}
                  expanded={expandedId === endpoint.id}
                  onToggleDeliveries={() => setExpandedId((id) => (id === endpoint.id ? null : endpoint.id))}
                />
                {expandedId === endpoint.id && <DeliveriesList endpointId={endpoint.id} />}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CreatedSecretBanner({ secret, onDone }: { secret: string; onDone: () => void }) {
  const t = useTranslations('dashboard.webhooks');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <Card className="mb-4 animate-scale-in border-warning-500/30 bg-warning-50">
      <p className="text-sm font-medium text-ink-900">{t('createdWarning')}</p>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-control border border-ink-200 bg-white px-3.5 py-3">
        <span className="truncate font-mono text-[13px] text-ink-800">{secret}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(secret).then(() => setCopied(true));
          }}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600"
        >
          <CopyIcon className="h-4 w-4" />
          {copied ? t('copied') : t('copyLink')}
        </button>
      </div>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onDone}>
        {t('done')}
      </Button>
    </Card>
  );
}

function CreateEndpointForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (secret: string) => void }) {
  const t = useTranslations('dashboard.webhooks');
  const createEndpoint = useCreateWebhookEndpoint();
  const [url, setUrl] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await createEndpoint.mutateAsync(url);
    onCreated(result.secret);
  }

  return (
    <Card className="mb-4 animate-scale-in">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <Label htmlFor="endpoint-url">{t('url')}</Label>
          <Input
            id="endpoint-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('urlPlaceholder')}
            required
          />
        </div>

        {createEndpoint.error && (
          <p className="text-sm text-danger-500">
            {createEndpoint.error instanceof ApiError ? createEndpoint.error.message : 'Something went wrong.'}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={createEndpoint.isPending}>
            {createEndpoint.isPending ? t('creating') : t('addEndpoint')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EndpointRow({
  endpoint,
  expanded,
  onToggleDeliveries,
}: {
  endpoint: WebhookEndpointView;
  expanded: boolean;
  onToggleDeliveries: () => void;
}) {
  const t = useTranslations('dashboard.webhooks');
  const revokeEndpoint = useRevokeWebhookEndpoint();
  const revoked = !endpoint.enabled;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-ink-100 text-ink-500">
          <WebhookIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{endpoint.url}</p>
          <p className="mt-0.5 text-xs text-ink-400">{new Date(endpoint.createdAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {revoked && <Badge tone="danger">{t('revoked')}</Badge>}
        <Button size="sm" variant="secondary" onClick={onToggleDeliveries}>
          {expanded ? t('hideDeliveries') : t('viewDeliveries')}
        </Button>
        {!revoked && (
          <Button
            size="sm"
            variant="danger"
            disabled={revokeEndpoint.isPending}
            onClick={() => {
              if (window.confirm(t('revokeConfirm'))) revokeEndpoint.mutate(endpoint.id);
            }}
          >
            {t('revoke')}
          </Button>
        )}
      </div>
    </div>
  );
}

function DeliveriesList({ endpointId }: { endpointId: string }) {
  const t = useTranslations('dashboard.webhooks');
  const { data: deliveries, isLoading } = useWebhookDeliveries(endpointId);

  return (
    <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-4 sm:px-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('deliveriesTitle')}</p>

      {isLoading && <div className="h-16 animate-pulse rounded-control bg-ink-100" />}

      {deliveries && deliveries.length === 0 && <p className="text-sm text-ink-400">{t('deliveriesEmpty')}</p>}

      {deliveries && deliveries.length > 0 && (
        <div className="space-y-2">
          {deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-white px-3.5 py-2.5 text-sm"
            >
              <span className="font-medium text-ink-800">{delivery.eventType}</span>
              <span className="text-xs text-ink-400">
                {t('attempt')} {delivery.attempt}
              </span>
              <Badge tone={toneForStatus(delivery.status)}>{delivery.status}</Badge>
              {delivery.statusCode !== null && (
                <span className="text-xs text-ink-400">HTTP {delivery.statusCode}</span>
              )}
              <span className="text-xs text-ink-400">
                {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
