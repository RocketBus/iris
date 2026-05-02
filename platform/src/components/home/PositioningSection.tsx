"use client";

import { useRef } from "react";

import { motion, useInView } from "motion/react";

import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

export function PositioningSection() {
  const { t } = useBrowserTranslation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const items = [
    { title: t("home.positioning.notSurveillanceTitle"), desc: t("home.positioning.notSurveillanceDesc") },
    { title: t("home.positioning.notRealtimeTitle"), desc: t("home.positioning.notRealtimeDesc") },
    { title: t("home.positioning.notIdeTitle"), desc: t("home.positioning.notIdeDesc") },
    { title: t("home.positioning.notProductivityTitle"), desc: t("home.positioning.notProductivityDesc") },
  ];

  return (
    <section className="py-20 sm:py-28" ref={ref}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.h2
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t("home.positioning.title")}
        </motion.h2>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/20 p-5"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <span className="mt-0.5 font-mono text-signal-red text-sm">
                ✕
              </span>
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
