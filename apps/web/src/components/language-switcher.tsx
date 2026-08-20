'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';

const LOCALE_LABELS: Record<string, string> = { en: 'EN', ru: 'RU' };

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const activeIndex = Math.max(0, routing.locales.indexOf(locale as (typeof routing.locales)[number]));

  return (
    <div
      className="relative inline-grid grid-cols-2 rounded-control bg-ink-100 p-1"
      aria-label={t('language')}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-[0.6rem] bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-snappy)]"
        style={{ width: 'calc(50% - 0.25rem)', transform: `translateX(${activeIndex * 100}%)` }}
      />
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => router.replace(pathname, { locale: loc })}
          aria-current={loc === locale}
          className={cn(
            'relative z-10 rounded-[0.6rem] px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
            loc === locale ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {LOCALE_LABELS[loc] ?? loc}
        </button>
      ))}
    </div>
  );
}
