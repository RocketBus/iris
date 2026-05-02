import type { Metadata } from "next";

import { SampleReport } from "@/components/sample/SampleReport";

const title = "Sample engineering impact report";
const description =
  "See what a real Iris analysis looks like — 161 commits over 90 days, stabilization dropping while velocity accelerates, PR lifecycle, stability map, correction cascades, and top-churn files.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "engineering intelligence report",
    "code stabilization",
    "code durability",
    "correction cascade",
    "PR lifecycle",
    "commit churn",
    "AI-assisted code quality",
    "Iris sample report",
  ],
  alternates: {
    canonical: "/sample",
  },
  openGraph: {
    type: "article",
    url: "/sample",
    title,
    description,
    siteName: "Iris",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris sample engineering impact report",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export default function SamplePage() {
  return <SampleReport />;
}
