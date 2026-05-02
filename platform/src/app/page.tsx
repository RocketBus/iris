import type { Metadata } from "next";

import { CTASection } from "@/components/home/CTASection";
import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { ModulesSection } from "@/components/home/ModulesSection";
import { PositioningSection } from "@/components/home/PositioningSection";
import { ProblemSection } from "@/components/home/ProblemSection";
import { ProvenDataSection } from "@/components/home/ProvenDataSection";

export const metadata: Metadata = {
  title: "Iris — Engineering Intelligence for the AI Era",
  description:
    "Measure what survives, not what ships. Analyze code durability, stabilization, and AI impact across your repositories. Zero dependencies, zero cloud.",
};

export default function Home() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <ProvenDataSection />
      <HowItWorksSection />
      <ModulesSection />
      <PositioningSection />
      <CTASection />
    </>
  );
}
