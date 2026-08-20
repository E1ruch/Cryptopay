import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'neutral' && 'bg-ink-100 text-ink-600',
        tone === 'brand' && 'bg-brand-50 text-brand-700',
        tone === 'success' && 'bg-success-50 text-success-600',
        tone === 'warning' && 'bg-warning-50 text-warning-600',
        tone === 'danger' && 'bg-danger-50 text-danger-600',
        className,
      )}
      {...props}
    />
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  CREATED: 'brand',
  PENDING: 'brand',
  DETECTED: 'brand',
  CONFIRMING: 'brand',
  PAID: 'success',
  SUCCEEDED: 'success',
  UNDERPAID: 'warning',
  OVERPAID: 'warning',
  FAILED: 'danger',
  EXHAUSTED: 'danger',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
};

export function toneForStatus(status: string): BadgeTone {
  return STATUS_TONES[status] ?? 'neutral';
}
