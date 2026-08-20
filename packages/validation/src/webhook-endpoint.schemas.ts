import { z } from 'zod';

export const createWebhookEndpointSchema = z.object({
  url: z.string().trim().url().max(2048),
});
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;
