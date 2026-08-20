'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { useCheckout } from '@/hooks/use-checkout';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { simulateCheckoutPayment, CheckoutApiError, type CheckoutView } from '@/lib/checkout-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangleIcon, CheckCircleIcon, ClockIcon, CopyIcon, XCircleIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export function CheckoutCard({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, error } = useCheckout(invoiceId);

  if (isLoading) {
    return <Card className="w-full max-w-md animate-pulse rounded-card bg-ink-100" />;
  }

  if (error instanceof CheckoutApiError && error.status === 404) {
    return (
      <ClosedState
        icon={<XCircleIcon className="h-7 w-7" />}
        title="Invoice not found"
        body="This payment link doesn't exist or may have been removed."
      />
    );
  }

  if (error || !data) {
    return (
      <ClosedState
        icon={<XCircleIcon className="h-7 w-7" />}
        title="Something went wrong"
        body="Couldn't load this payment. Please refresh the page."
      />
    );
  }

  switch (data.status) {
    case 'PENDING':
      return <PendingState invoice={data} />;
    case 'DETECTED':
    case 'CONFIRMING':
      return (
        <ClosedState
          icon={<ClockIcon className="h-7 w-7 animate-pulse" />}
          title="Confirming your payment"
          body="We've detected your transfer and are waiting for it to confirm. This page updates automatically."
          tone="brand"
        />
      );
    case 'PAID':
      return <PaidState invoice={data} />;
    case 'UNDERPAID':
      return (
        <ClosedState
          icon={<AlertTriangleIcon className="h-7 w-7" />}
          title="Underpayment received"
          body={`We received less than the ${data.amount} ${data.token} expected. Please contact ${data.merchantName} to resolve this.`}
          tone="warning"
        />
      );
    case 'OVERPAID':
      return (
        <ClosedState
          icon={<AlertTriangleIcon className="h-7 w-7" />}
          title="Overpayment received"
          body={`We received more than the ${data.amount} ${data.token} expected. Please contact ${data.merchantName} about a refund.`}
          tone="warning"
        />
      );
    case 'EXPIRED':
      return (
        <ClosedState
          icon={<ClockIcon className="h-7 w-7" />}
          title="Payment link expired"
          body="This checkout session has expired. Please ask the merchant for a new payment link."
        />
      );
    default:
      return (
        <ClosedState
          icon={<XCircleIcon className="h-7 w-7" />}
          title="Payment unavailable"
          body={`This invoice is ${data.status.toLowerCase()} and can no longer be paid.`}
        />
      );
  }
}

function PendingState({ invoice }: { invoice: CheckoutView }) {
  const secondsLeft = useCountdown(invoice.expiresAt);
  const expired = secondsLeft <= 0;

  return (
    <Card className="w-full max-w-md animate-scale-in overflow-hidden !p-0">
      <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-8 text-center text-white sm:px-8">
        <p className="text-sm font-medium text-white/70">{invoice.merchantName}</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">
          {invoice.amount}
          <span className="ml-2 text-2xl text-white/80">{invoice.token}</span>
        </p>
        {invoice.description && <p className="mt-2 text-sm text-white/80">{invoice.description}</p>}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <ClockIcon className="h-3.5 w-3.5" />
          {expired ? 'Expiring…' : `Expires in ${formatCountdown(secondsLeft)}`}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <p className="text-center text-sm font-medium text-ink-500">Send manually</p>

        <div className="mx-auto mt-4 flex w-fit items-center justify-center rounded-card border border-ink-100 bg-white p-3">
          <QRCode value={invoice.paymentAddress} size={168} fgColor="#131a24" bgColor="#ffffff" />
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-ink-500">
            {invoice.token} on {networkLabel(invoice.network)}
          </p>
          <AddressField address={invoice.paymentAddress} />
        </div>

        <div className="mt-6 border-t border-ink-100 pt-6">
          <SimulatePaymentButton invoiceId={invoice.id} disabled={expired} />
          <p className="mt-3 text-center text-xs text-ink-400">
            Test mode — Phase 1 has no real blockchain yet. This simulates a customer paying.
          </p>
        </div>
      </div>
    </Card>
  );
}

function SimulatePaymentButton({ invoiceId, disabled }: { invoiceId: string; disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setErrorMessage(null);
    try {
      await simulateCheckoutPayment(invoiceId);
    } catch (err) {
      setErrorMessage(err instanceof CheckoutApiError ? err.message : 'Could not simulate the payment.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button type="button" className="w-full" onClick={() => void handleClick()} disabled={disabled || pending}>
        {pending ? 'Simulating…' : 'Simulate payment'}
      </Button>
      {errorMessage && <p className="mt-2 text-center text-xs text-danger-500">{errorMessage}</p>}
    </div>
  );
}

function AddressField({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => setCopied(true));
      }}
      className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-control border border-ink-200 bg-ink-50 px-3.5 py-3 text-left transition-colors hover:bg-ink-100"
    >
      <span className="truncate font-mono text-[13px] text-ink-800">{address}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600">
        <CopyIcon className="h-4 w-4" />
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}

function PaidState({ invoice }: { invoice: CheckoutView }) {
  const successUrl = invoice.successUrl;

  useEffect(() => {
    if (!successUrl) return;
    const id = setTimeout(() => {
      window.location.href = successUrl;
    }, 2500);
    return () => clearTimeout(id);
  }, [successUrl]);

  return (
    <Card className="w-full max-w-md animate-scale-in text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-600">
        <CheckCircleIcon className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-ink-900">Payment confirmed</h1>
      <p className="mt-2 text-sm text-ink-500">
        {invoice.amount} {invoice.token} received by {invoice.merchantName}.
      </p>
      {invoice.successUrl ? (
        <p className="mt-4 text-xs text-ink-400">Redirecting you back…</p>
      ) : (
        <p className="mt-4 text-xs text-ink-400">You can close this page.</p>
      )}
    </Card>
  );
}

function ClosedState({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: 'neutral' | 'warning' | 'brand';
}) {
  return (
    <Card className="w-full max-w-md animate-scale-in text-center">
      <div
        className={cn(
          'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
          tone === 'neutral' && 'bg-ink-100 text-ink-500',
          tone === 'warning' && 'bg-warning-50 text-warning-500',
          tone === 'brand' && 'bg-brand-50 text-brand-600',
        )}
      >
        {icon}
      </div>
      <h1 className="mt-4 text-xl font-semibold text-ink-900">{title}</h1>
      <p className="mt-2 text-sm text-ink-500">{body}</p>
    </Card>
  );
}

function networkLabel(network: string): string {
  return network.length <= 4 ? network.toUpperCase() : network.charAt(0).toUpperCase() + network.slice(1);
}
