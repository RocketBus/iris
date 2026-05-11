"use client";

import { useRef } from "react";

import { motion, useInView } from "motion/react";

import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

function TerminalBlock({
  command,
  label,
  delay,
}: {
  command: string;
  label: string;
  delay: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      className="flex flex-col gap-2"
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
    >
      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-signal-purple">
        {label}
      </span>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3">
        <code className="font-mono text-sm text-zinc-100">
          <span className="text-signal-purple">$</span> {command}
        </code>
      </div>
    </motion.div>
  );
}

export function HowItWorksSection() {
  const { t } = useBrowserTranslation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <section className="py-20 sm:py-28" ref={ref}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.h2
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t("home.howItWorks.title")}
        </motion.h2>

        <div className="mt-12 flex flex-col gap-6">
          <TerminalBlock
            label={t("home.howItWorks.installLabel")}
            command={`curl -fsSL ${appUrl}/install.sh | sh`}
            delay={0.1}
          />
          <TerminalBlock
            label={t("home.howItWorks.runLabel")}
            command="iris /path/to/repo --trend"
            delay={0.2}
          />
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-signal-purple">
              {t("home.howItWorks.readLabel")}
            </span>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="text-sm text-zinc-300">
                {t("home.howItWorks.readDescription")}
              </p>
            </div>
          </motion.div>
          <TerminalBlock
            label={t("home.howItWorks.prLabel")}
            command="iris pr 42 --comment"
            delay={0.4}
          />
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <div className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="text-sm text-zinc-300">
                {t("home.howItWorks.prDescription")}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
