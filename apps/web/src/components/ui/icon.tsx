'use client';

import { MorphIcon, type MorphIconProps } from 'morphicons/react';

export function Icon({ strokeWidth = 1.75, reducedMotion = 'user', spring = 'snappy', ...props }: MorphIconProps) {
  return <MorphIcon strokeWidth={strokeWidth} reducedMotion={reducedMotion} spring={spring} {...props} />;
}
