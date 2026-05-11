"use client";

import Link from "next/link";

import { ApertureMark } from "@/components/brand/ApertureMark";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";

export function Footer() {
  const { t } = useBrowserTranslation();
  return (
    <footer className="border-t border-border/50 py-8">
      <div className="container flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <ApertureMark className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Iris</span>
          <span className="text-muted-foreground text-xs">
            &copy; {new Date().getFullYear()}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground/50">
          {buildVersion}
        </span>
        <nav className="flex items-center gap-4">
          <a
            href="https://github.com/RocketBus/clickbus-iris"
            className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <Link
            href="/privacy"
            className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
          >
            {t("footer.privacy")}
          </Link>
          <Link
            href="/terms"
            className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
          >
            {t("footer.terms")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
