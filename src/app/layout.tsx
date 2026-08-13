import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { LayoutFrame } from "@/components/layout-frame";
import { Toaster } from "sonner";
import { ThemeSync } from "@/components/theme-sync";
import { MotionProvider } from "@/components/motion-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { Bricolage_Grotesque, Geist_Mono, Inter } from "next/font/google";

export const dynamic = "force-dynamic";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800"],
  display: "swap",
});

const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  display: "swap",
});

const monoFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "600"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ornigami.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ornigami — every review, answered in your voice",
  description:
    "Ornigami helps local businesses reply to every Google review in their own voice, follow up with happy customers, and stay easy to find — from one calm workspace.",
  openGraph: {
    title: "Ornigami — every review, answered in your voice",
    description: "Reviews, follow-ups, and visibility workflows in one calm workspace.",
    url: siteUrl,
    siteName: "Ornigami",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ornigami — practical tools for local growth" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ornigami — every review, answered in your voice",
    description: "Reviews, follow-ups, and visibility workflows in one hub.",
    images: ["/opengraph-image"],
  },
  icons: { icon: [{ url: "/ornigami-favicon.svg", type: "image/svg+xml" }, { url: "/ornigami-mark-32.png", sizes: "32x32" }, { url: "/ornigami-mark-16.png", sizes: "16x16" }], apple: "/ornigami-mark-180.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable} antialiased flex min-h-screen flex-col`}>
        <AuthProvider>
          <MotionProvider>
            <ThemeSync />
            <LayoutFrame>{children}</LayoutFrame>
            <Toaster position="bottom-right" richColors closeButton />
            <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: "Ornigami", url: siteUrl, logo: `${siteUrl}/logo-ink.svg` }} />
          </MotionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

