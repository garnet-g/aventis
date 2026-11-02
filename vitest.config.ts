import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // The database and image tests are memory-hungry (an in-process Postgres, image rendering). On a machine that is
    // also running Docker and a dev server, more workers means a worker occasionally gets killed for lack of memory.
    maxWorkers: 2,
  },
});
