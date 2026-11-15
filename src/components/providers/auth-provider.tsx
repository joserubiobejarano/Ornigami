"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The campaign lab is a local-only operator surface with no account context.
  if (pathname === "/campaign-lab") return <>{children}</>;

  return <SessionProvider>{children}</SessionProvider>;
}
