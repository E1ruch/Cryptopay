'use client';

import { useParams } from 'next/navigation';
import { CheckoutCard } from '@/components/checkout-card';

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink-50 px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(50%_60%_at_50%_0%,var(--color-brand-100),transparent)]"
      />
      <div className="relative flex w-full flex-col items-center">
        <p className="mb-6 animate-fade-up text-sm font-semibold tracking-tight text-ink-400">CryptoPay</p>
        <div className="animate-fade-up [animation-delay:80ms]">
          <CheckoutCard invoiceId={params.id} />
        </div>
      </div>
    </main>
  );
}
