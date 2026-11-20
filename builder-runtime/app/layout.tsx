import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BuilderShell } from "@/components/builder/builder-shell";

import "./globals.css";

export const dynamic = "force-dynamic";

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
let metadataBase: URL;
try {
  metadataBase = new URL(configuredAppUrl || "http://localhost:3000");
} catch {
  metadataBase = new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Ornigami Builder",
    template: "%s · Ornigami Builder",
  },
  description: "Private, invite-only Ornigami campaign builder.",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/ornigami-favicon.svg", type: "image/svg+xml" },
      { url: "/ornigami-mark-32.png", sizes: "32x32" },
      { url: "/ornigami-mark-16.png", sizes: "16x16" },
    ],
    apple: "/ornigami-mark-180.png",
  },
};

export default function BuilderRuntimeLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased flex min-h-screen flex-col">
        <BuilderShell>{children}</BuilderShell>
      </body>
    </html>
  );
}
