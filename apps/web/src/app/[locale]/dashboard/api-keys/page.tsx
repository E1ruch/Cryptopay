'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { API_KEY_ENVIRONMENTS, API_KEY_SCOPES } from '@cryptopay/shared';
import { useApiKeys, useCreateApiKey, useRevokeApiKey, type ApiKeyView } from '@/hooks/use-api-keys';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CopyIcon, KeyIcon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api-client';

export default function ApiKeysPage() {
  const t = useTranslations('dashboard.apiKeys');
  const { data: keys, isLoading } = useApiKeys();
  const [formOpen, setFormOpen] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6 flex animate-fade-up items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t('title')}</h1>
        {!formOpen && !createdRawKey && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t('create')}
          </Button>
        )}
      </div>

      {createdRawKey && (
        <CreatedKeyBanner rawKey={createdRawKey} onDone={() => setCreatedRawKey(null)} />
      )}

      {formOpen && !createdRawKey && (
        <CreateKeyForm
          onCancel={() => setFormOpen(false)}
          onCreated={(rawKey) => {
            setFormOpen(false);
            setCreatedRawKey(rawKey);
          }}
        />
      )}

      {isLoading && !keys && <div className="mt-4 h-40 animate-pulse rounded-card bg-ink-100" />}

      {keys && keys.length === 0 && !formOpen && (
        <Card className="mt-4 animate-fade-up">
          <p className="text-sm text-ink-500">{t('empty')}</p>
        </Card>
      )}

      {keys && keys.length > 0 && (
        <Card className="mt-4 animate-fade-up overflow-hidden !p-0">
          <div className="divide-y divide-ink-100">
            {keys.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CreatedKeyBanner({ rawKey, onDone }: { rawKey: string; onDone: () => void }) {
  const t = useTranslations('dashboard.apiKeys');
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
        <span className="truncate font-mono text-[13px] text-ink-800">{rawKey}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(rawKey).then(() => setCopied(true));
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

function CreateKeyForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (rawKey: string) => void }) {
  const t = useTranslations('dashboard.apiKeys');
  const createKey = useCreateApiKey();
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<(typeof API_KEY_ENVIRONMENTS)[number]>('test');
  const [scopes, setScopes] = useState<string[]>([]);

  function toggleScope(scope: string) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await createKey.mutateAsync({ name, environment, scopes });
    onCreated(result.rawKey);
  }

  return (
    <Card className="mb-4 animate-scale-in">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <Label htmlFor="key-name">{t('name')}</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
          />
        </div>

        <div>
          <Label htmlFor="key-env">{t('environment')}</Label>
          <select
            id="key-env"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as (typeof API_KEY_ENVIRONMENTS)[number])}
            className="w-full rounded-control border border-ink-200 bg-ink-50 px-3.5 py-3 text-[15px] text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {API_KEY_ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>{t('scopes')}</Label>
          <div className="flex flex-wrap gap-2">
            {API_KEY_SCOPES.map((scope) => (
              <button
                type="button"
                key={scope}
                onClick={() => toggleScope(scope)}
                className={
                  scopes.includes(scope)
                    ? 'rounded-full bg-brand-500 px-3 py-1.5 text-xs font-medium text-white'
                    : 'rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600'
                }
              >
                {scope}
              </button>
            ))}
          </div>
        </div>

        {createKey.error && (
          <p className="text-sm text-danger-500">
            {createKey.error instanceof ApiError ? createKey.error.message : 'Something went wrong.'}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={createKey.isPending || scopes.length === 0}>
            {createKey.isPending ? t('creating') : t('create')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ApiKeyRow({ apiKey }: { apiKey: ApiKeyView }) {
  const t = useTranslations('dashboard.apiKeys');
  const revokeKey = useRevokeApiKey();
  const revoked = Boolean(apiKey.revokedAt);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-ink-100 text-ink-500">
          <KeyIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{apiKey.name}</p>
          <p className="mt-0.5 font-mono text-xs text-ink-400">{apiKey.keyPrefix}…</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone={apiKey.environment === 'live' ? 'success' : 'neutral'}>{apiKey.environment}</Badge>
        <span className="hidden text-xs text-ink-400 sm:inline">
          {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : t('never')}
        </span>
        {!revoked && (
          <Button
            size="sm"
            variant="danger"
            disabled={revokeKey.isPending}
            onClick={() => {
              if (window.confirm(t('revokeConfirm'))) revokeKey.mutate(apiKey.id);
            }}
          >
            {t('revoke')}
          </Button>
        )}
        {revoked && <Badge tone="danger">{t('revoked')}</Badge>}
      </div>
    </div>
  );
}
