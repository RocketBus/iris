"use client";

import { useRef, useState } from "react";

import { motion, useInView } from "motion/react";

import { Button } from "@/components/ui/button";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

export function CTASection() {
  const { t } = useBrowserTranslation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [copied, setCopied] = useState(false);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const installCmd = `curl -fsSL ${appUrl}/install.sh | sh`;

  function handleCopy() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="relative py-20 sm:py-28 bg-card/30" ref={ref}>
      <div className="grid-dots absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.h2
          className="text-2xl font-bold tracking-tight sm:text-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t("home.cta.title")}
        </motion.h2>

        <motion.p
          className="mt-3 text-muted-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {t("home.cta.description")}
        </motion.p>

        <motion.div
          className="mt-8 flex items-center gap-2 rounded-lg border border-signal-purple/30 bg-zinc-950 p-3 glow-primary"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <code className="flex-1 text-left font-mono text-sm text-zinc-100 overflow-x-auto">
            <span className="text-signal-purple">$</span> {installCmd}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="shrink-0 font-mono text-xs hover:text-signal-purple"
          >
            {copied ? t("home.cta.copied") : t("home.cta.copy")}
          </Button>
        </motion.div>

        <motion.p
          className="mt-4 font-mono text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {t("home.cta.requirements")}
        </motion.p>
      </div>
    </section>
  );
}
