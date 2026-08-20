import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ListRowProps extends HTMLAttributes<HTMLSpanElement> {
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
}

export function ListRow({ icon, active, disabled, className, children, ...props }: ListRowProps) {
  return (
    <span
      className={cn(
        'flex items-center gap-3 rounded-control px-3 py-2.5 text-[15px] font-medium transition-all duration-200',
        active && 'bg-brand-50 text-brand-700',
        !active && !disabled && 'text-ink-700',
        disabled && 'cursor-default text-ink-400',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] transition-all duration-200',
          active ? 'bg-brand-500 text-white shadow-[0_2px_6px_-1px_rgba(42,171,238,0.5)]' : 'bg-ink-100 text-ink-500',
          disabled && 'bg-ink-100 text-ink-300 shadow-none',
        )}
      >
        {icon}
      </span>
      {children}
    </span>
  );
}
