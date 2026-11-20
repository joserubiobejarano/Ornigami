"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The campaign lab is a local-only operator surface with no account context.
  if (pathname === "/campaign-lab") return <>{children}</>;

  // The production builder owns its own access boundary. Do not mount the
  // reputation Auth.js session provider or fetch its session for these routes.
  if (pathname === "/builder" || pathname.startsWith("/builder/")) {
    return <>{children}</>;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
