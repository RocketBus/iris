"use client";

import { useRef } from "react";

import { motion, useInView } from "motion/react";

import { Card, CardContent } from "@/components/ui/card";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

function StatCard({
  value,
  label,
  delay,
}: {
  value: string;
  label: string;
  delay: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
    >
      <Card className="border-border/50 bg-card/50 hover:border-signal-purple/30 transition-colors">
        <CardContent className="p-6">
          <p className="font-mono text-2xl font-bold text-signal-purple sm:text-3xl">
            {value}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ProvenDataSection() {
  const { t } = useBrowserTranslation();
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="font-mono text-xs uppercase tracking-wider text-signal-purple">
            {t("home.provenData.eyebrow")}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto">
            {t("home.provenData.description")}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard value="79% vs 64%" label={t("home.provenData.stat1Label")} delay={0} />
          <StatCard value="45%" label={t("home.provenData.stat2Label")} delay={0.1} />
          <StatCard value="100%" label={t("home.provenData.stat3Label")} delay={0.2} />
          <StatCard value="54 commits" label={t("home.provenData.stat4Label")} delay={0.3} />
        </div>
      </div>
    </section>
  );
}
