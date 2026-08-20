'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { registerSchema } from '@cryptopay/validation';
import { apiFetch } from '@/lib/api-client';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export function RegisterForm() {
  const t = useTranslations('auth.register');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('passwordHint'));
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/v1/auth/register', { method: 'POST', body: parsed.data });
      setSuccess(true);
    } catch {
      // Registration never reveals whether the email already existed
      // (spec: avoid user enumeration) — show the same success state.
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-[460px] text-center shadow-[0_1px_2px_rgba(19,26,36,0.04),0_12px_32px_-16px_rgba(19,26,36,0.12)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </div>
        <p className="text-sm text-ink-700">{t('success')}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          {t('loginLink')}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-[460px] shadow-[0_1px_2px_rgba(19,26,36,0.04),0_12px_32px_-16px_rgba(19,26,36,0.12)]">
      <h1 className="mb-7 text-2xl font-semibold tracking-tight text-ink-900">{t('title')}</h1>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">{t('password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-ink-500">{t('passwordHint')}</p>
        </div>
        {error && (
          <p role="alert" className="rounded-control bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="mt-2 w-full">
          {submitting ? t('submitting') : t('submit')}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-ink-500">
        {t('hasAccount')}{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          {t('loginLink')}
        </Link>
      </p>
    </Card>
  );
}
