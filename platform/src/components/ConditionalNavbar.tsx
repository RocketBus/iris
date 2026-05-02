'use client';

import { usePathname } from 'next/navigation';

import { Navbar } from '@/components/blocks/navbar';

const PUBLIC_ROUTES = new Set([
  '/',
  '/faq',
  '/privacy',
  '/terms',
  '/sample',
  '/deck',
]);

const PUBLIC_PREFIXES = ['/cli/', '/me/'];

const HIDDEN_PREFIXES = [
  '/auth',
  '/api',
  '/accept-invite',
  '/setup',
];

export function ConditionalNavbar() {
  const pathname = usePathname();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const isPublic =
    PUBLIC_ROUTES.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // Tenant pages (/[slug]/...) render their own TenantNavbar.
  if (!isPublic) return null;

  return <Navbar />;
}
