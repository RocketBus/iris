"use client";

import { useRef } from "react";

import { motion, useInView } from "motion/react";

import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

export function ProblemSection() {
  const { t } = useBrowserTranslation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const oldMetrics = [
    t("home.problem.oldVelocity"),
    t("home.problem.oldThroughput"),
    t("home.problem.oldCycleTime"),
  ];
  const newMetrics = [
    t("home.problem.newStabilization"),
    t("home.problem.newDurability"),
    t("home.problem.newSignalNoise"),
  ];

  return (
    <section className="relative py-20 sm:py-28 bg-card/30" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.h2
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t("home.problem.title")}
        </motion.h2>

        <motion.p
          className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {t("home.problem.description")}
        </motion.p>

        <div className="mt-12 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-8">
          {/* Old metrics (crossed out) */}
          <motion.div
            className="flex flex-col gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {oldMetrics.map((m) => (
              <span
                key={m}
                className="font-mono text-lg text-muted-foreground/50 line-through decoration-signal-red/60 decoration-2"
              >
                {m}
              </span>
            ))}
          </motion.div>

          {/* Arrow */}
          <motion.span
            className="font-mono text-2xl text-signal-purple rotate-90 sm:rotate-0"
            initial={{ opacity: 0, scale: 0 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            →
          </motion.span>

          {/* New metrics */}
          <motion.div
            className="flex flex-col gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {newMetrics.map((m) => (
              <span
                key={m}
                className="font-mono text-lg text-signal-purple font-semibold"
              >
                {m}
              </span>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
