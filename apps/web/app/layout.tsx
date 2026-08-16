import "../styles/globals.css";
import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "../lib/siteConfig";

export const metadata: Metadata = {
  // Required for the relative URLs used below (canonical, OG image, etc.) to
  // resolve into full, absolute URLs in the actual page output.
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  // Explicit, rather than left to Next's default, so there's no ambiguity —
  // this is what guarantees Google is never accidentally told not to index
  // the site.
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    // No `images` entry needed here — the app/opengraph-image.tsx file in
    // this same folder is auto-detected by Next.js and wired in automatically.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
