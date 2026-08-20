'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { loginSchema } from '@cryptopay/validation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useRouter, Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    });
    if (!parsed.success) {
      setError(t('error'));
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/v1/auth/login', { method: 'POST', body: parsed.data });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && /two-factor/i.test(err.message)) {
        setNeedsTotp(true);
      }
      setError(t('error'));
    } finally {
      setSubmitting(false);
    }
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {needsTotp && (
          <div>
            <Label htmlFor="totp">{t('totpCode')}</Label>
            <Input
              id="totp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink-500">{t('totpCodeHint')}</p>
          </div>
        )}
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
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">
          {t('registerLink')}
        </Link>
      </p>
    </Card>
  );
}
