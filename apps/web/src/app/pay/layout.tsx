import type { ReactNode } from 'react';
import { QueryProvider } from '@/lib/query-client';
import '../globals.css';

// Its own root layout (html/body) — the public checkout page (spec §19)
// lives outside the [locale] segment on purpose (see proxy.ts) and is
// English-only for Phase 1, so it doesn't share NextIntlClientProvider.
export default function PayLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
