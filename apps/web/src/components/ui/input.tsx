import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-control border border-ink-200 bg-ink-50 px-3.5 py-3 text-[15px] text-ink-900 transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}
