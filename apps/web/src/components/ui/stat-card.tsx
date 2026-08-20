import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: ReactNode;
  value: ReactNode;
  footer?: ReactNode;
}

export function StatCard({ eyebrow, value, footer, className, children, ...props }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-card bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white sm:p-8',
        className,
      )}
      {...props}
    >
      {eyebrow && <p className="text-sm font-medium text-white/70">{eyebrow}</p>}
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{value}</p>
      {footer && <div className="mt-4 text-sm text-white/70">{footer}</div>}
      {children}
    </div>
  );
}
