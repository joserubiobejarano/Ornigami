"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function CTAButton() {
  const { status } = useSession();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  if (!mounted || status === "loading") {
    return (
      <Button size="lg" asChild>
        <Link href="/signup">Start free</Link>
      </Button>
    );
  }

  return (
    <Button size="lg" asChild>
      <Link href={status === "authenticated" ? "/dashboard" : "/signup"}>
        {status === "authenticated" ? "Go to dashboard" : "Start free"}
      </Link>
    </Button>
  );
}
