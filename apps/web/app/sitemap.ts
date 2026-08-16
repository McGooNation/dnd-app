import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/siteConfig";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      // The homepage is the only public, general-purpose page — everything
      // else (a specific lobby, a specific invite link) is private/dynamic
      // and intentionally not something a search engine should index; see
      // the disallow rule in app/robots.ts for the same reasoning.
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
