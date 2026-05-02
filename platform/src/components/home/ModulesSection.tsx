"use client";

import { useRef } from "react";

import { motion, useInView } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

type Category = "cat_ai" | "cat_temporal" | "cat_structural" | "cat_infra";

type Module = {
  name: string;
  descKey: string;
  category: Category;
};

const modules: Module[] = [
  { name: "Origin Classifier", descKey: "originClassifier", category: "cat_ai" },
  { name: "Code Durability", descKey: "codeDurability", category: "cat_ai" },
  { name: "Correction Cascades", descKey: "correctionCascades", category: "cat_ai" },
  { name: "Fix Targeting", descKey: "fixTargeting", category: "cat_ai" },
  { name: "Acceptance Rate", descKey: "acceptanceRate", category: "cat_ai" },
  { name: "Origin Funnel", descKey: "originFunnel", category: "cat_ai" },
  { name: "Attribution Gap", descKey: "attributionGap", category: "cat_ai" },
  { name: "PR Insights", descKey: "prInsights", category: "cat_ai" },
  { name: "Activity Timeline", descKey: "activityTimeline", category: "cat_temporal" },
  { name: "Trend Analysis", descKey: "trendAnalysis", category: "cat_temporal" },
  { name: "Pattern Detection", descKey: "patternDetection", category: "cat_temporal" },
  { name: "Stability Map", descKey: "stabilityMap", category: "cat_structural" },
  { name: "Churn Investigation", descKey: "churnInvestigation", category: "cat_structural" },
  { name: "Commit Shape", descKey: "commitShape", category: "cat_structural" },
  { name: "Delivery Velocity", descKey: "deliveryVelocity", category: "cat_structural" },
  { name: "Priming Detection", descKey: "primingDetection", category: "cat_infra" },
  { name: "Attribution Hook", descKey: "attributionHook", category: "cat_infra" },
];

const categoryColors: Record<Category, string> = {
  cat_ai: "border-signal-purple/30 text-signal-purple",
  cat_temporal: "border-signal-yellow/30 text-signal-yellow",
  cat_structural: "border-foreground/20 text-foreground/70",
  cat_infra: "border-muted-foreground/30 text-muted-foreground",
};

const categoryLabelKey: Record<Category, string> = {
  cat_ai: "home.modules.catAI",
  cat_temporal: "home.modules.catTemporal",
  cat_structural: "home.modules.catStructural",
  cat_infra: "home.modules.catInfra",
};

export function ModulesSection() {
  const { t } = useBrowserTranslation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="relative py-20 sm:py-28 bg-card/30" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.h2
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t("home.modules.title")}
        </motion.h2>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod, i) => (
            <motion.div
              key={mod.name}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.3, delay: i * 0.04 }}
            >
              <Card className="border-border/50 bg-card/30 hover:border-signal-purple/20 transition-all hover:glow-primary-sm group">
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 font-mono text-signal-purple/60 text-xs group-hover:text-signal-purple transition-colors">
                    &gt;
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">
                        {mod.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${categoryColors[mod.category]}`}
                      >
                        {t(categoryLabelKey[mod.category])}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`home.modules.items.${mod.descKey}`)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
