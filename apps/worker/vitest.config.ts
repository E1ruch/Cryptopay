import { defineConfig } from 'vitest/config';

// Scopes `test:unit` (bare `vitest run`) to src/ only — without this, the
// default include pattern also picks up test/**/*.integration.test.ts,
// which needs a real Postgres/Redis + .env (loaded only by
// vitest.integration.config.ts's setupFiles) and fails outside that context.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
