/**
 * Central queue name registry (spec §36). Phase 0 only runs `healthCheck`;
 * the rest are declared now so Phase 1+ workers/producers import a name
 * from here instead of hardcoding strings across the codebase.
 */
export const QUEUE_NAMES = {
  healthCheck: 'health-check',
  blockchainScan: 'blockchain.scan',
  paymentDetect: 'payment.detect',
  paymentConfirm: 'payment.confirm',
  webhookDispatch: 'webhook.dispatch',
  webhookRetry: 'webhook.retry',
  notificationsSend: 'notifications.send',
  analyticsProcess: 'analytics.process',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
