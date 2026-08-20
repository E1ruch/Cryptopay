import { config } from 'dotenv';
import { resolve } from 'node:path';

// dotenv never overrides an already-set var — setting these first keeps
// confirmation-accrual tests fast (real wall-clock ms, not real chain time)
// without touching the shared .env used by `pnpm dev`.
process.env.BLOCKCHAIN_BLOCK_TIME_MS ??= '20';
process.env.REQUIRED_CONFIRMATIONS ??= '2';

config({ path: resolve(import.meta.dirname, '../../.env') });
