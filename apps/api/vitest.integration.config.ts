import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts', 'test/**/*.integration.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Auth flow tests share module-level rate-limit counters in Redis and
    // mutate shared tables — run serially to avoid cross-test interference.
    fileParallelism: false,
  },
  plugins: [
    // Vitest's default esbuild transform drops TS decorator metadata, which
    // NestJS's DI container needs to resolve constructor parameter types —
    // swc preserves it, matching NestJS's own recommended Vitest setup.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
