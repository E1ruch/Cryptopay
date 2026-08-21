'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ListRow } from '@/components/ui/list-row';
import { Icon } from '@/components/ui/icon';
import { icons, NAV_ICONS } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const NAV_KEYS = [
  'overview',
  'transactions',
  'invoices',
  'paymentLinks',
  'apiKeys',
  'webhooks',
  'settings',
] as const;

// Routes wired up so far — invoices/apiKeys/webhooks/settings land with
// Phase 1's merchant dashboard (spec §63). transactions/paymentLinks have no
// destination yet, so they stay inert placeholders like Phase 0 left them.
const NAV_ROUTES: Partial<Record<(typeof NAV_KEYS)[number], string>> = {
  overview: '/dashboard',
  invoices: '/dashboard/invoices',
  apiKeys: '/dashboard/api-keys',
  webhooks: '/dashboard/webhooks',
  settings: '/dashboard/settings',
};

function isActiveRoute(pathname: string, route: string): boolean {
  return route === '/dashboard' ? pathname === route : pathname.startsWith(route);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    await apiFetch('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-ink-50 md:flex">
      <aside className="hidden shrink-0 border-r border-ink-100 bg-white px-4 py-6 md:block md:w-64">
        <div className="mb-8 animate-fade-up px-3 text-lg font-semibold tracking-tight text-ink-900">
          CryptoPay
        </div>
        <nav className="space-y-1">
          {NAV_KEYS.map((key, i) => {
            const route = NAV_ROUTES[key];
            const active = route ? isActiveRoute(pathname, route) : false;
            const row = (
              <ListRow icon={<Icon icon={NAV_ICONS[key]} className="h-4.5 w-4.5" />} active={active} disabled={!route}>
                {t(`nav.${key}`)}
              </ListRow>
            );
            return (
              <div key={key} className="animate-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                {route ? <Link href={route}>{row}</Link> : row}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex animate-fade-up items-center justify-between border-b border-ink-100 bg-white/80 px-4 py-3.5 backdrop-blur md:justify-end md:px-8 md:py-4">
          <span className="text-lg font-semibold tracking-tight text-ink-900 md:hidden">CryptoPay</span>
          <div className="flex items-center gap-2.5">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm font-medium text-ink-500 transition-all duration-150 hover:bg-ink-100 hover:text-ink-900 active:scale-[0.97]"
            >
              <Icon icon={icons.logout} className="h-4 w-4" />
              <span className="hidden sm:inline">{t('signOut')}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:px-8 md:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex animate-slide-up justify-around border-t border-ink-100 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur md:hidden">
        {NAV_KEYS.map((key) => {
          const route = NAV_ROUTES[key];
          const active = route ? isActiveRoute(pathname, route) : false;
          const itemClassName = cn(
            'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-control px-1 py-1.5 text-[10px] font-medium transition-colors duration-200',
            active ? 'text-brand-600' : 'cursor-default text-ink-400',
          );
          const content = (
            <>
              <Icon
                icon={NAV_ICONS[key]}
                className={cn('h-5.5 w-5.5 shrink-0 transition-transform duration-200', active && 'scale-110')}
              />
              <span className="w-full truncate text-center">{t(`nav.${key}`)}</span>
            </>
          );
          return route ? (
            <Link key={key} href={route} className={itemClassName}>
              {content}
            </Link>
          ) : (
            <span key={key} className={itemClassName}>
              {content}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
