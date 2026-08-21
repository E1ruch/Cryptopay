import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10a1 1 0 0 0 1 1H9v-6h6v6h2.5a1 1 0 0 0 1-1V9" />
    </svg>
  );
}

export function ArrowsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3.5h7l4 4V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 12.5h6M9 15.5h6" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 7.5 12.4 6a3.3 3.3 0 0 1 4.7 4.7l-1.5 1.4" />
      <path d="M13 16.5 11.6 18a3.3 3.3 0 0 1-4.7-4.7l1.5-1.4" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="15" r="3.5" />
      <path d="M10.5 12.5 18 5" />
      <path d="M15.5 7.5 18 10M18.5 6.5 21 9" />
    </svg>
  );
}

export function WebhookIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 17a3 3 0 1 1 2.6-4.5" />
      <path d="M8.6 12.5 13 5a3 3 0 0 1 5.2 3l-1.7 3" />
      <path d="M13.3 19.9a3 3 0 0 0 4.1-1.1l2.1-3.6" />
      <path d="M9.5 17.5h6.9" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8 6.3 6.3" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 4.5h2.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H15" />
      <path d="M10.5 8 6.5 12l4 4" />
      <path d="M6.5 12H18" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3 11 14.8l4.5-5.6" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4M12 16.7v.1" />
    </svg>
  );
}

export function XCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="10.5" height="10.5" rx="2" />
      <path d="M14.5 9V6.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H9" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </svg>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 20.5V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15.5" />
      <path d="M3.5 20.5h17" />
      <path d="M9.5 8h1M13.5 8h1M9.5 11.5h1M13.5 11.5h1M9.5 15h1M13.5 15h1" />
    </svg>
  );
}

export const NAV_ICONS = {
  overview: HomeIcon,
  transactions: ArrowsIcon,
  invoices: DocumentIcon,
  paymentLinks: LinkIcon,
  apiKeys: KeyIcon,
  webhooks: WebhookIcon,
  settings: GearIcon,
} as const;
