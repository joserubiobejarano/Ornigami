import type { MetadataRoute } from "next";
import { getOptionalEnv } from "@/lib/env";

const siteUrl = getOptionalEnv("NEXT_PUBLIC_APP_URL") || "https://ornigami.com";

const pageDates: Record<string, string> = {
  "": "2026-08-13",
  "/review-replies": "2026-08-13",
  "/review-booster": "2026-08-13",
  "/local-seo": "2026-08-13",
  "/pricing": "2026-08-13",
  "/about": "2026-08-13",
  "/contact": "2026-08-13",
  "/free-audit": "2026-08-13",
  "/privacy": "2026-08-12",
  "/terms": "2026-08-12",
  "/legal": "2026-08-12",
};

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl.replace(/\/$/, "");
  const routes = Object.keys(pageDates);
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: pageDates[route],
    changeFrequency: route === "" || route === "/pricing" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
