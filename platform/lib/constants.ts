/**
 * Client-safe constants derived from NEXT_PUBLIC_* env vars.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time, so these work in both
 * server and client components. Centralising them here avoids scattered
 * process.env access throughout the codebase.
 */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Iris';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
export const DEFAULT_LOGO_URL = process.env.NEXT_PUBLIC_DEFAULT_LOGO_URL || '/logo.svg';
