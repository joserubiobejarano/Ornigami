import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ornigami.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl.replace(/\/$/, "");
  const routes = ["", "/pricing", "/review-booster", "/review-replies", "/audit", "/contact", "/privacy", "/terms", "/legal"];
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/pricing" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}