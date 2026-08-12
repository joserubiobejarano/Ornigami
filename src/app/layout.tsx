import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { LayoutFrame } from "@/components/layout-frame";
import { Toaster } from "sonner";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ornigami.com";

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
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ornigami — practical tools for local growth" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ornigami - Review replies and follow-ups for local businesses",
    description: "Reviews, follow-ups, and visibility workflows in one hub.",
    images: ["/opengraph-image"],
  },
  icons: { icon: "/favicon.ico", apple: "/favicon.ico" },
};

// The proxy supplies a per-request CSP nonce. Static HTML cannot receive that
// nonce, so keep the root document dynamic so Next.js can nonce its streamed
// inline hydration scripts correctly.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased flex flex-col min-h-screen">
        <AuthProvider>
          <LayoutFrame>{children}</LayoutFrame>
          <Toaster position="bottom-right" richColors closeButton />
        </AuthProvider>
      </body>
    </html>
  );
}

