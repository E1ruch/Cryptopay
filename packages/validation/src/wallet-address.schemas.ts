import { z } from 'zod';

/**
 * Merchant-supplied deposit address (spec §42 — the platform never
 * generates or holds a key for this). Address *format* validation is
 * network-specific and happens against the real `BlockchainAdapter`
 * (`WalletAddressService.setDepositAddress`), not here — this schema only
 * covers wire shape.
 */
export const setWalletAddressSchema = z.object({
  network: z.string().trim().min(1).max(40),
  token: z.string().trim().min(1).max(20),
  address: z.string().trim().min(1).max(128),
});
export type SetWalletAddressInput = z.infer<typeof setWalletAddressSchema>;
