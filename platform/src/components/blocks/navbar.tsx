"use client";

import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FaGithub } from "react-icons/fa6";

import { ApertureMark } from "@/components/brand/ApertureMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  const { t } = useBrowserTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const items = [
    { label: t("publicNav.deck"), href: "/deck" },
    { label: t("publicNav.faq"), href: "/faq" },
  ];

  return (
    <section
      className={cn(
        "bg-background/70 absolute left-1/2 z-50 w-[min(90%,700px)] -translate-x-1/2 rounded-4xl border backdrop-blur-md transition-all duration-300",
        "top-5 lg:top-12",
      )}
    >
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <ApertureMark className="size-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Iris</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="flex items-center gap-4 max-lg:hidden">
          {items.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative bg-transparent px-1.5 text-sm font-medium transition-opacity hover:opacity-75",
                pathname === link.href && "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-2.5">
          <LanguageToggle className="max-lg:hidden" />
          <Link href="/auth/signin" className="max-lg:hidden">
            <Button variant="outline" size="sm">
              {t("publicNav.signIn")}
            </Button>
          </Link>
          <Link href="/auth/signup" className="max-lg:hidden">
            <Button size="sm">{t("publicNav.getStarted")}</Button>
          </Link>
          <a
            href="https://github.com/RocketBus/clickbus-iris"
            className="text-muted-foreground hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaGithub className="size-4" />
            <span className="sr-only">{t("publicNav.githubAria")}</span>
          </a>

          {/* Hamburger Menu Button (Mobile Only) */}
          <button
            className="text-muted-foreground relative flex size-8 lg:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <span className="sr-only">{t("publicNav.openMenu")}</span>
            <div className="absolute top-1/2 left-1/2 block w-[18px] -translate-x-1/2 -translate-y-1/2">
              <span
                aria-hidden="true"
                className={`absolute block h-0.5 w-full rounded-full bg-current transition duration-500 ease-in-out ${isMenuOpen ? "rotate-45" : "-translate-y-1.5"}`}
              ></span>
              <span
                aria-hidden="true"
                className={`absolute block h-0.5 w-full rounded-full bg-current transition duration-500 ease-in-out ${isMenuOpen ? "opacity-0" : ""}`}
              ></span>
              <span
                aria-hidden="true"
                className={`absolute block h-0.5 w-full rounded-full bg-current transition duration-500 ease-in-out ${isMenuOpen ? "-rotate-45" : "translate-y-1.5"}`}
              ></span>
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu Navigation */}
      <div
        className={cn(
          "bg-background fixed inset-x-0 top-[calc(100%+1rem)] flex flex-col rounded-2xl border p-6 transition-all duration-300 ease-in-out lg:hidden",
          isMenuOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-4 opacity-0",
        )}
      >
        <nav className="divide-border flex flex-1 flex-col divide-y">
          {items.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-primary hover:text-primary/80 py-4 text-base font-medium transition-colors first:pt-0 last:pb-0",
                pathname === link.href && "text-muted-foreground",
              )}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-4">
            <LanguageToggle className="self-center" />
            <Link href="/auth/signin">
              <Button variant="outline" className="w-full">
                {t("publicNav.signIn")}
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button className="w-full">{t("publicNav.getStarted")}</Button>
            </Link>
          </div>
        </nav>
      </div>
    </section>
  );
};
