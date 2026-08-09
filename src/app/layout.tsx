import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { LayoutFrame } from "@/components/layout-frame";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ornigami.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ornigami - Review replies and follow-ups for local businesses",
  description:
    "Ornigami helps local teams manage review replies and customer follow-ups from one focused workspace.",
  openGraph: {
    title: "Ornigami - Review replies and follow-ups for local businesses",
    description: "Reviews, follow-ups, and visibility workflows in one hub.",
    url: siteUrl,
    siteName: "Ornigami",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ornigami — AI agents for local growth" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ornigami - Review replies and follow-ups for local businesses",
    description: "Reviews, follow-ups, and visibility workflows in one hub.",
    images: ["/opengraph-image"],
  },
  icons: { icon: "/file.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <AuthProvider>
          <LayoutFrame>{children}</LayoutFrame>
        </AuthProvider>
      </body>
    </html>
  );
}

