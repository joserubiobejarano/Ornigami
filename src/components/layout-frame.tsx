"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/marketing/Header";
import { CookieConsent } from "@/components/cookie-consent";

function isInAppRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname === "/reviews" ||
    pathname === "/settings" ||
    pathname === "/connect" ||
    pathname === "/login" ||
    pathname === "/signup"
  );
}

export function LayoutFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showFooter = !isInAppRoute(pathname);
  const showMarketingChrome = !isInAppRoute(pathname);

  return (
    <>
      {showMarketingChrome ? <Header /> : null}
      <div className="flex-1">{children}</div>
      {showFooter ? <Footer /> : null}
      {showMarketingChrome ? <CookieConsent /> : null}
    </>
  );
}
