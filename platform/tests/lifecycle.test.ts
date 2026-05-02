import { describe, it, expect, beforeEach } from 'vitest';

import { isShuttingDown, markShuttingDown } from '@/lib/lifecycle';

describe('lifecycle', () => {
  beforeEach(() => {
    globalThis.__gracefulShutdown = undefined;
  });

  it('isShuttingDown returns false by default', () => {
    expect(isShuttingDown()).toBe(false);
  });

  it('markShuttingDown sets the flag', () => {
    markShuttingDown();
    expect(isShuttingDown()).toBe(true);
  });

  it('flag survives across imports (globalThis)', () => {
    globalThis.__gracefulShutdown = true;
    expect(isShuttingDown()).toBe(true);
  });
});
