'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { icons } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'danger' | 'neutral';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TONE_ICON = { success: icons.checkCircle, danger: icons.xCircle, neutral: null };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = ++idRef.current;
    setItems((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((item) => {
          const toneIcon = TONE_ICON[item.tone];
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex max-w-sm animate-fade-up items-center gap-2 rounded-control border px-4 py-3 text-sm font-medium shadow-[0_8px_24px_-8px_rgba(19,26,36,0.25)]',
                item.tone === 'success' && 'border-success-500/20 bg-success-50 text-success-600',
                item.tone === 'danger' && 'border-danger-500/20 bg-danger-50 text-danger-600',
                item.tone === 'neutral' && 'border-ink-100 bg-white text-ink-800',
              )}
            >
              {toneIcon && <Icon icon={toneIcon} className="h-4.5 w-4.5 shrink-0" />}
              {item.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
