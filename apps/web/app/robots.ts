import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Invite links are per-lobby, effectively private (their security
      // comes from the code being unguessable, not secret from search
      // engines specifically) — there's no reason for one to ever end up
      // indexed or cached by a search engine, so crawlers are asked not to
      // follow them. This doesn't affect the invite feature itself at all;
      // people with a real invite link can still open and use it normally,
      // this only concerns automated crawling.
      disallow: "/join/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
