'use client';

import { useEffect, useState } from 'react';

/** Seconds remaining until `target`, ticking down every second; never negative. */
export function useCountdown(target: string): number {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(target));

  useEffect(() => {
    setSecondsLeft(secondsUntil(target));
    const id = setInterval(() => setSecondsLeft(secondsUntil(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return secondsLeft;
}

function secondsUntil(target: string): number {
  return Math.max(0, Math.round((new Date(target).getTime() - Date.now()) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
