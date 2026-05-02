/**
 * Process lifecycle state (Factor 9: Disposability/Graceful Lifecycle).
 *
 * Uses globalThis so the shutdown flag is visible across all modules
 * in the same Node.js process.
 */

declare global {
   
  var __gracefulShutdown: boolean | undefined;
}

export function isShuttingDown(): boolean {
  return globalThis.__gracefulShutdown === true;
}

export function markShuttingDown(): void {
  globalThis.__gracefulShutdown = true;
}
