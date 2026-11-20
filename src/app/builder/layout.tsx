import type { Metadata } from "next";

import { BuilderShell } from "@/components/builder/builder-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ornigami Builder",
  description: "Private, invite-only Ornigami campaign builder.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function BuilderLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <BuilderShell>{children}</BuilderShell>;
}
