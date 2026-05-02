import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE,
  isLanguage,
  parseAcceptLanguage,
} from '../lib/locale';
import { getTenantFromRequest } from '../lib/tenant';

function ensureLanguageCookie(request: NextRequest, response: NextResponse) {
  const existing = request.cookies.get(LANGUAGE_COOKIE)?.value;
  if (isLanguage(existing)) return;
  const acceptLanguage = request.headers.get('accept-language');
  const resolved = parseAcceptLanguage(acceptLanguage) ?? DEFAULT_LANGUAGE;
  // Mirror onto request so server-side cookies() reads the resolved value during SSR
  request.cookies.set(LANGUAGE_COOKIE, resolved);
  // Persist on the response so subsequent visits skip the Accept-Language parse
  response.headers.append(
    'Set-Cookie',
    `${LANGUAGE_COOKIE}=${encodeURIComponent(resolved)}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`,
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip proxy for static files, API routes, and auth pages
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/setup') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    const response = NextResponse.next();
    ensureLanguageCookie(request, response);
    return response;
  }

  const tenantContext = await getTenantFromRequest();

  // If no tenant detected and not on root pages, continue
  if (!tenantContext.tenant && !pathname.startsWith('/')) {
    return NextResponse.next();
  }

  // If tenant detected, rewrite to tenant route
  if (tenantContext.tenant) {
    const tenantPath = `/${tenantContext.tenant}${pathname}`;
    const url = request.nextUrl.clone();
    url.pathname = tenantPath;

    // Add tenant context to headers for use in components
    const response = NextResponse.rewrite(url);
    response.headers.set('x-tenant', tenantContext.tenant);
    response.headers.set('x-is-subdomain', tenantContext.isSubdomain.toString());
    response.headers.set('x-pathname', pathname);
    ensureLanguageCookie(request, response);
    return response;
  }

  const response = NextResponse.next();
  ensureLanguageCookie(request, response);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
