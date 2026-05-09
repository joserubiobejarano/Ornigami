"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Footer } from "@/components/Footer";

function isInAppRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname === "/reviews" ||
    pathname === "/settings" ||
    pathname === "/content" ||
    pathname === "/audit" ||
    pathname === "/connect"
  );
}

export function LayoutFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showFooter = !isInAppRoute(pathname);

  return (
    <>
      <div className="flex-1">{children}</div>
      {showFooter ? <Footer /> : null}
    </>
  );
}

