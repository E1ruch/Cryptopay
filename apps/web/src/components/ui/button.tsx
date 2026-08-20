import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
}

// Content-sized by default (not full-width) — forms that want a full-width
// submit button opt in with className="w-full", same as any other width.
export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-control font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        size === 'md' && 'px-4 py-3.5 text-[15px]',
        size === 'sm' && 'px-3 py-2 text-sm',
        variant === 'primary' &&
          'bg-brand-500 text-white shadow-[0_1px_2px_rgba(34,158,217,0.05)] hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        variant === 'secondary' &&
          'bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300',
        variant === 'ghost' &&
          'text-ink-600 hover:bg-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300',
        variant === 'danger' &&
          'bg-danger-50 text-danger-600 hover:bg-danger-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-500',
        className,
      )}
      {...props}
    />
  );
}
