import type { MetadataRoute } from "next";

const BASE_URL = "https://iris.clickbus.com";
const LAST_MODIFIED = "2026-04-23";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: LAST_MODIFIED, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/sample`, lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/deck`, lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/faq`, lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/privacy`, lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.3 },
  ];
}
