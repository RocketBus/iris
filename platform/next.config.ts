import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build-time version string surfaced in the footer.
 *
 * Resolution order:
 *   1. Explicit override via `NEXT_PUBLIC_BUILD_VERSION` env var.
 *   2. `package.json` version, plus the short Vercel commit SHA when present.
 *
 * The Vercel system env var `VERCEL_GIT_COMMIT_SHA` is set on every build
 * inside Vercel, so production / preview deploys get a unique identifier
 * even between releases without changing `package.json`.
 *
 * `package.json` is read at config-load time via fs to stay portable
 * across Next's TS loader and direct Node ESM imports, which differ on
 * JSON import attribute support.
 */
function resolveBuildVersion(): string {
  if (process.env.NEXT_PUBLIC_BUILD_VERSION) {
    return process.env.NEXT_PUBLIC_BUILD_VERSION;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(
    readFileSync(resolve(here, "package.json"), "utf-8"),
  ) as { version: string };
  const base = `v${pkg.version}`;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return sha ? `${base} (${sha})` : base;
}

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  // Baked into the client bundle at build time so the footer can render it.
  env: {
    NEXT_PUBLIC_BUILD_VERSION: resolveBuildVersion(),
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://api.resend.com",
              "frame-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
