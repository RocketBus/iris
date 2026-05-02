import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = join(rootDir, 'src');
const libDir = join(rootDir, 'lib');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // Thresholds are not enforced yet. Once coverage stabilizes above 70%
      // we can re-add `thresholds: { lines: 70, branches: 70, ... }` here.
    },
  },
  resolve: {
    alias: [
      { find: /^@\/lib\/(.*)$/, replacement: join(libDir, '$1') },
      { find: /^@\/lib$/, replacement: libDir },
      { find: /^@\/(.*)$/, replacement: join(srcDir, '$1') },
      { find: /^@$/, replacement: srcDir },
    ],
  },
});
