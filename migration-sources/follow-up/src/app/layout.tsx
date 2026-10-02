import "./globals.css";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist_Mono, Inter } from "next/font/google";

const displayFont = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["700", "800"], display: "swap" });
const sansFont = Inter({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600"], display: "swap" });
const monoFont = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "Ornigami Review Booster",
  description: "Follow up with customers after a visit and make it easy to leave a review.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable} bg-background text-foreground`}>{children}</body>
    </html>
  );
}
