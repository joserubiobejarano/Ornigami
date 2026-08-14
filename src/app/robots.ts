import type { MetadataRoute } from "next";
import { getOptionalEnv } from "@/lib/env";

const siteUrl = getOptionalEnv("NEXT_PUBLIC_APP_URL") || "https://ornigami.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/", "/connect", "/login", "/signup", "/r/"] },
    sitemap: `${siteUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
