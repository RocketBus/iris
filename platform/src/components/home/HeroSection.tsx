"use client";

import Link from "next/link";

import { motion } from "motion/react";

import { DeliveryPulse } from "@/components/delivery-pulse/DeliveryPulse";
import { Button } from "@/components/ui/button";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

export function HeroSection() {
  const { t } = useBrowserTranslation();
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28 noise-bg scanlines">
      <div className="grid-dots absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div className="min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block font-mono text-xs text-signal-purple tracking-wider uppercase mb-4">
                {t("home.hero.badge")}
              </span>
            </motion.div>

            <motion.h1
              className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <span className="text-glow">{t("home.hero.title")}</span>
            </motion.h1>

            <motion.p
              className="mt-6 text-base text-muted-foreground sm:text-lg max-w-xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {t("home.hero.description")}
            </motion.p>

            <motion.div
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Link href="/auth/signup">
                <Button size="lg" className="w-full sm:w-auto glow-pulse">
                  {t("home.hero.ctaPrimary")}
                </Button>
              </Link>
              <Link href="/sample">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto border-border/50"
                >
                  {t("home.hero.ctaSecondary")}
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* Right: Delivery Pulse */}
          <motion.div
            className="min-w-0 rounded-lg border border-border/50 bg-card/50 p-6 glow-primary"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-signal-red/60" />
              <span className="h-3 w-3 rounded-full bg-signal-yellow/60" />
              <span className="h-3 w-3 rounded-full bg-signal-purple/60" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {t("home.hero.terminalCaption")}
              </span>
            </div>
            <DeliveryPulse />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
