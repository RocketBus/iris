import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/auth/", "/cli/", "/setup", "/api/"],
    },
    sitemap: "https://iris.clickbus.com/sitemap.xml",
  };
}
