import React from "react";
import type { Metadata } from "next";
import Script from "next/script";

import { Background } from "@/components/background";
import { SaasFAQ } from "@/components/blocks/saas-faq";

export const metadata: Metadata = {
  title: "FAQ | Clickbus Iris",
  description:
    "Frequently asked questions about Clickbus Iris — engineering intelligence, AI impact, code durability, and how the analysis works.",
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What does Iris measure?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Iris analyzes your Git history to surface delivery-quality signals: stabilization, code durability, fix cascades, attribution gaps, and AI impact. Reports are point-in-time, not live monitoring.",
      },
    },
    {
      "@type": "Question",
      name: "How does the analysis work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run the CLI on any repo. It reads commits, PRs, and code-survival data locally and produces a Markdown report plus JSON metrics. The engine has no cloud dependency.",
      },
    },
    {
      "@type": "Question",
      name: "Which AI tools does it detect?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Copilot, Claude, Cursor, Windsurf and other assistants are detected via commit metadata, co-author trailers, and velocity patterns. New tools can be added via the prepare-commit-msg hook.",
      },
    },
    {
      "@type": "Question",
      name: "Does Iris read my code?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The engine runs locally and only inspects Git metadata and diffs. Nothing leaves your machine unless you connect the optional cloud platform for cross-repo aggregation.",
      },
    },
    {
      "@type": "Question",
      name: "Does it rank or score developers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Iris is explicitly designed to analyze systems, never individuals. There is no productivity ranking, no per-author leaderboard, and no individual score.",
      },
    },
    {
      "@type": "Question",
      name: "What does the cloud platform aggregate?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The platform aggregates metrics across repos and over time, offers organization-level dashboards, change detection, and cross-repo comparison. The CLI alone is fully usable without it.",
      },
    },
    {
      "@type": "Question",
      name: "How do I install?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run the install script (curl -fsSL https://iris.clickbus.com/install.sh | sh) or pipx install iris. Requires Python 3.11+ and Git.",
      },
    },
    {
      "@type": "Question",
      name: "How much does it cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The CLI is free and open source under Apache 2.0. The hosted platform is internal to Clickbus collaborators; reach out for access.",
      },
    },
    {
      "@type": "Question",
      name: "How can I contribute or report issues?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The project lives on GitHub at RocketBus/clickbus-iris. Issues and PRs are welcome.",
      },
    },
  ],
};

export default function Page() {
  return (
    <Background>
      <Script
        id="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        strategy="afterInteractive"
      />
      <SaasFAQ />
    </Background>
  );
}
