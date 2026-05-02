import type { Metadata } from "next";

import { Deck } from "@/components/deck/Deck";

const title = "Iris Metrics Deck";
const description =
  "The twenty-five metrics Iris produces, explained one slide at a time. Learn what each measures and why it matters for AI-era engineering.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "engineering metrics",
    "code stabilization metric",
    "correction cascade",
    "line survival",
    "AI-era engineering",
    "Iris metrics",
  ],
  alternates: {
    canonical: "/deck",
  },
  openGraph: {
    type: "article",
    url: "/deck",
    title,
    description,
    siteName: "Iris",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris Metrics Deck",
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

export default function DeckPage() {
  return <Deck />;
}
